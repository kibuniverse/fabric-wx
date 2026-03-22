// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const usersCollection = db.collection('users')

/**
 * 生成唯一的9位知织ID
 * @returns {string} 9位数字知织ID
 */
function generateZhizhiId() {
  return Math.floor(100000000 + Math.random() * 900000000).toString()
}

/**
 * 检查知织ID是否已存在
 * @param {string} zhizhiId
 * @returns {Promise<boolean>}
 */
async function isZhizhiIdExists(zhizhiId) {
  const result = await usersCollection.where({
    zhizhiId: zhizhiId
  }).count()
  return result.total > 0
}

/**
 * 生成唯一的知织ID（确保不重复）
 * @param {number} maxRetries 最大重试次数
 * @returns {Promise<string>}
 */
async function generateUniqueZhizhiId(maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const zhizhiId = generateZhizhiId()
    const exists = await isZhizhiIdExists(zhizhiId)
    if (!exists) {
      return zhizhiId
    }
  }
  // 如果重试多次仍然重复，使用时间戳后缀确保唯一
  const timestamp = Date.now().toString().slice(-6)
  return '1' + timestamp + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { nickName, avatarUrl } = event

  try {
    console.log('登录云函数被调用, openid:', openid)

    // 先尝试用 openid 查询
    let userResult = await usersCollection.where({
      openid: openid
    }).get()
    console.log('用 openid 查询结果:', userResult.data.length, '条记录')

    // 如果没找到，尝试用 _openid 查询（兼容旧数据）
    if (userResult.data.length === 0) {
      userResult = await usersCollection.where({
        _openid: openid
      }).get()
      console.log('用 _openid 查询结果:', userResult.data.length, '条记录')

      // 如果用 _openid 找到了，迁移旧数据：添加 openid 字段
      if (userResult.data.length > 0) {
        console.log('迁移旧数据，添加 openid 字段')
        await usersCollection.doc(userResult.data[0]._id).update({
          data: { openid: openid }
        })
      }
    }

    // 用户已存在，返回已有数据
    if (userResult.data.length > 0) {
      const existingUser = userResult.data[0]

      // 如果传入了新的昵称或头像，更新用户信息
      if (nickName || avatarUrl) {
        const updateData = {
          updatedAt: db.serverDate()
        }
        if (nickName) updateData.nickName = nickName
        if (avatarUrl) updateData.avatarUrl = avatarUrl

        await usersCollection.doc(existingUser._id).update({
          data: updateData
        })

        // 返回更新后的数据
        return {
          success: true,
          isNewUser: false,
          data: {
            ...existingUser,
            ...updateData
          }
        }
      }

      return {
        success: true,
        isNewUser: false,
        data: existingUser
      }
    }

    // 新用户，创建记录
    console.log('创建新用户, openid:', openid)
    const zhizhiId = await generateUniqueZhizhiId()

    const newUserData = {
      openid,  // 显式保存 openid
      zhizhiId,
      nickName: nickName || '微信用户',
      avatarUrl: avatarUrl || '',
      totalKnittingTime: 0, // 总针织时长（毫秒）
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }

    const createResult = await usersCollection.add({
      data: newUserData
    })

    return {
      success: true,
      isNewUser: true,
      data: {
        _id: createResult._id,
        ...newUserData
      }
    }

  } catch (error) {
    console.error('登录云函数错误:', error)
    return {
      success: false,
      error: error.message || '登录失败'
    }
  }
}