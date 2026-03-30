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

    // 上传模式：将本地数据上传到云端，完全覆盖 counters
    if (action === 'upload') {
      await usersCollection.doc(user._id).update({
        data: {
          counterKeys: counterKeys || [],
          counters: db.command.set(counters || {}),
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
    // 核心逻辑：只合并云端 counterKeys 中存在的计数器（删除的计数器会被丢弃）
    if (action === 'sync') {
      const cloudCounters = user.counters || {}
      const cloudKeys = user.counterKeys || []
      const localCounters = counters || {}
      const localKeys = counterKeys || []

      // 构建云端 counterKeys 的 Set（用于判断哪些计数器应该保留）
      const cloudKeysSet = new Set(cloudKeys.map(k => k.key))

      // 合并计数器列表：本地 + 云端独有的新增
      const mergedKeysMap = new Map()
      for (const key of localKeys) {
        mergedKeysMap.set(key.key, key)
      }
      for (const key of cloudKeys) {
        if (!mergedKeysMap.has(key.key)) {
          mergedKeysMap.set(key.key, key)
        }
      }
      const mergedKeys = Array.from(mergedKeysMap.values())

      // 合并计数器数据：只合并在云端 counterKeys 中存在的计数器
      // 这样可以确保：被删除的计数器（不在云端 counterKeys 中）的数据不会被恢复
      const mergedCounters = {}

      for (const key of Object.keys(localCounters)) {
        // 如果云端没有这个计数器（已被其他设备删除），跳过
        if (!cloudKeysSet.has(key)) {
          continue
        }

        const localCounter = localCounters[key]
        const cloudCounter = cloudCounters[key]

        if (!cloudCounter) {
          mergedCounters[key] = localCounter
        } else {
          const localTime = localCounter.updatedAt || 0
          const cloudTime = cloudCounter.updatedAt || 0
          mergedCounters[key] = localTime >= cloudTime ? localCounter : cloudCounter
        }
      }

      // 添加云端独有的新增计数器数据
      for (const key of cloudKeys) {
        if (!localCounters[key.key] && cloudCounters[key.key]) {
          mergedCounters[key.key] = cloudCounters[key.key]
        }
      }

      await usersCollection.doc(user._id).update({
        data: {
          counterKeys: mergedKeys,
          counters: db.command.set(mergedCounters),
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