// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const usersCollection = db.collection('users')

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { action, counterKeys, counters } = event

  try {
    // 查询用户
    let userResult = await usersCollection.where({
      openid: openid
    }).get()

    // 兼容旧数据
    if (userResult.data.length === 0) {
      userResult = await usersCollection.where({
        _openid: openid
      }).get()
    }

    if (userResult.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      }
    }

    const user = userResult.data[0]
    const now = db.serverDate()

    // 上传模式：将本地数据上传到云端
    if (action === 'upload') {
      await usersCollection.doc(user._id).update({
        data: {
          counterKeys: counterKeys || [],
          counters: counters || {},
          lastCounterSyncTime: now,
          updatedAt: now
        }
      })

      return {
        success: true,
        data: {
          counterKeys: counterKeys || [],
          counters: counters || {}
        }
      }
    }

    // 下载模式：将云端数据下载到本地
    if (action === 'download') {
      return {
        success: true,
        data: {
          counterKeys: user.counterKeys || [],
          counters: user.counters || {}
        }
      }
    }

    // 同步模式：基于 updatedAt 合并数据
    if (action === 'sync') {
      const cloudCounters = user.counters || {}
      const cloudKeys = user.counterKeys || []
      const localCounters = counters || {}
      const localKeys = counterKeys || []

      // 合并计数器列表（以本地为准，保留云端独有的）
      const mergedKeysMap = new Map()

      // 先添加云端的
      for (const key of cloudKeys) {
        mergedKeysMap.set(key.key, key)
      }

      // 再用本地的覆盖/添加
      for (const key of localKeys) {
        mergedKeysMap.set(key.key, key)
      }

      const mergedKeys = Array.from(mergedKeysMap.values())

      // 合并计数器数据（基于 updatedAt）
      const mergedCounters = { ...cloudCounters }

      for (const key of Object.keys(localCounters)) {
        const localCounter = localCounters[key]
        const cloudCounter = cloudCounters[key]

        if (!cloudCounter) {
          // 云端没有，直接使用本地的
          mergedCounters[key] = localCounter
        } else {
          // 都有，比较 updatedAt，保留最新的
          const localTime = localCounter.updatedAt || 0
          const cloudTime = cloudCounter.updatedAt || 0

          if (localTime >= cloudTime) {
            mergedCounters[key] = localCounter
          }
          // 否则保留云端的
        }
      }

      // 更新云端数据
      await usersCollection.doc(user._id).update({
        data: {
          counterKeys: mergedKeys,
          counters: mergedCounters,
          lastCounterSyncTime: now,
          updatedAt: now
        }
      })

      return {
        success: true,
        data: {
          counterKeys: mergedKeys,
          counters: mergedCounters
        }
      }
    }

    return {
      success: false,
      error: '无效的操作类型'
    }

  } catch (error) {
    console.error('同步计数器数据失败:', error)
    return {
      success: false,
      error: error.message || '同步失败'
    }
  }
}