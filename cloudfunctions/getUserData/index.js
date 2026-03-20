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

  try {
    // 查询用户数据
    const userResult = await usersCollection.where({
      _openid: openid
    }).get()

    if (userResult.data.length === 0) {
      return {
        success: false,
        error: '用户不存在',
        data: null
      }
    }

    const user = userResult.data[0]

    return {
      success: true,
      data: {
        zhizhiId: user.zhizhiId,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
        totalKnittingTime: user.totalKnittingTime || 0,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }

  } catch (error) {
    console.error('获取用户数据云函数错误:', error)
    return {
      success: false,
      error: error.message || '获取数据失败',
      data: null
    }
  }
}