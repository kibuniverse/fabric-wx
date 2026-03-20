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

  const { totalKnittingTime, nickName, avatarUrl } = event

  try {
    // 查询用户
    const userResult = await usersCollection.where({
      _openid: openid
    }).get()

    if (userResult.data.length === 0) {
      return {
        success: false,
        error: '用户不存在，请先登录'
      }
    }

    const user = userResult.data[0]
    const updateData = {
      updatedAt: db.serverDate()
    }

    // 更新针织总时长（累加）
    if (typeof totalKnittingTime === 'number' && totalKnittingTime > 0) {
      updateData.totalKnittingTime = (user.totalKnittingTime || 0) + totalKnittingTime
    }

    // 更新昵称
    if (nickName) {
      updateData.nickName = nickName
    }

    // 更新头像
    if (avatarUrl) {
      updateData.avatarUrl = avatarUrl
    }

    // 执行更新
    await usersCollection.doc(user._id).update({
      data: updateData
    })

    return {
      success: true,
      data: {
        totalKnittingTime: updateData.totalKnittingTime || user.totalKnittingTime,
        nickName: updateData.nickName || user.nickName,
        avatarUrl: updateData.avatarUrl || user.avatarUrl
      }
    }

  } catch (error) {
    console.error('数据同步云函数错误:', error)
    return {
      success: false,
      error: error.message || '同步失败'
    }
  }
}