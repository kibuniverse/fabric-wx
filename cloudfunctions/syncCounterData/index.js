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
          counterKeys: counterKeys || [],  // 只存 keys 数组
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
      const cloudKeys = user.counterKeys || []
      const cloudCounters = user.counters || {}

      // 兼容旧数据：如果 cloudKeys 是对象数组（旧格式），转换为字符串数组
      // 同时将 title 信息合入 counters[key].name
      const normalizedCloudKeys = []
      for (const k of cloudKeys) {
        if (typeof k === 'string') {
          normalizedCloudKeys.push(k)
        } else {
          // 旧格式：{key: 'xxx', title: '计数器名'}
          const keyStr = k.key
          normalizedCloudKeys.push(keyStr)
          // 如果 title 存在但 counters 中没有 name，将 title 合入 counters
          if (k.title && cloudCounters[keyStr] && !cloudCounters[keyStr].name) {
            cloudCounters[keyStr].name = k.title
          }
        }
      }

      return {
        success: true,
        data: {
          counterKeys: normalizedCloudKeys,
          counters: cloudCounters
        }
      }
    }

    // 同步模式：基于 updatedAt 合并数据
    // 核心逻辑：
    // - counterKeys 以云端为准（删除操作只在云端 counterKeys 中体现）
    // - counters 数据基于 updatedAt 合并（只合并云端 counterKeys 中存在的计数器）
    if (action === 'sync') {
      const cloudCounters = user.counters || {}
      const cloudKeys = user.counterKeys || []
      const localCounters = counters || {}
      const localKeys = counterKeys || []

      // 兼容旧数据：如果 cloudKeys 是对象数组（旧格式），转换为字符串数组
      // 同时将 title 信息合入 counters[key].name（防止名称丢失）
      const normalizedCloudKeys = []
      for (const k of cloudKeys) {
        if (typeof k === 'string') {
          normalizedCloudKeys.push(k)
        } else {
          // 旧格式：{key: 'xxx', title: '计数器名'}
          const keyStr = k.key
          normalizedCloudKeys.push(keyStr)
          // 如果 title 存在但 counters 中没有 name，将 title 合入 counters
          if (k.title && cloudCounters[keyStr] && !cloudCounters[keyStr].name) {
            cloudCounters[keyStr].name = k.title
          }
        }
      }
      const cloudKeysSet = new Set(normalizedCloudKeys)

      // 合并计数器数据和 keys
      const mergedCounters = {}
      const mergedKeys = []

      // 1. 以云端 counterKeys 为基准（云端没有 = 已删除）
      for (const key of normalizedCloudKeys) {
        const localCounter = localCounters[key]
        const cloudCounter = cloudCounters[key]

        if (!cloudCounter && !localCounter) {
          // 两边都没有 counterData，保留 key（可能有数据延迟）
          mergedKeys.push(key)
        } else if (!localCounter) {
          // 只有云端有 counterData，使用云端的
          mergedCounters[key] = cloudCounter
          mergedKeys.push(key)
        } else if (!cloudCounter) {
          // 只有本地有 counterData（云端可能有数据延迟），使用本地的
          mergedCounters[key] = localCounter
          mergedKeys.push(key)
        } else {
          // 两边都有 counterData，基于 updatedAt 选择较新的
          const localTime = localCounter.updatedAt || 0
          const cloudTime = cloudCounter.updatedAt || 0

          if (localTime >= cloudTime) {
            mergedCounters[key] = localCounter
            mergedKeys.push(key)
          } else {
            mergedCounters[key] = cloudCounter
            mergedKeys.push(key)
          }
        }
      }

      // 2. 本地有但云端没有的计数器 → 已被删除，不保留
      // （删除操作只在云端 counterKeys 中体现，本地应跟随删除）
      // 注意：不再添加本地独有的计数器

      await usersCollection.doc(user._id).update({
        data: {
          counterKeys: mergedKeys,  // 只存 keys 数组
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