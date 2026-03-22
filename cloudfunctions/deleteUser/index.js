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
    // 查询用户是否存在
    const userResult = await usersCollection.where({
      _openid: openid
    }).get()

    if (userResult.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      }
    }

    // 删除用户数据
    const userId = userResult.data[0]._id
    await usersCollection.doc(userId).remove()

    return {
      success: true,
      message: '账号已注销'
    }

  } catch (error) {
    console.error('注销账号云函数错误:', error)
    return {
      success: false,
      error: error.message || '注销失败'
    }
  }
}