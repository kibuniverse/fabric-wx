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

  const { totalKnittingTime, nickName, avatarUrl, zhizhiId, zhizhiIdModified } = event

  console.log('syncData 接收参数:', { totalKnittingTime, nickName, avatarUrl, zhizhiId, zhizhiIdModified })

  try {
    // 查询用户（兼容旧数据：先查 openid，再查 _openid）
    let userResult = await usersCollection.where({
      openid: openid
    }).get()

    // 如果没找到，尝试用 _openid 查询（兼容旧数据）
    if (userResult.data.length === 0) {
      userResult = await usersCollection.where({
        _openid: openid
      }).get()
    }

    if (userResult.data.length === 0) {
      return {
        success: false,
        error: '用户不存在，请先登录'
      }
    }

    const user = userResult.data[0]
    console.log('云端用户数据:', { zhizhiId: user.zhizhiId, zhizhiIdModified: user.zhizhiIdModified })

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

    // 更新知织ID（仅在用户主动修改时更新）
    // 条件：传入了新的知织ID，且用户未修改过，且新ID与云端不同
    console.log('知织ID更新条件检查:', {
      zhizhiId,
      cloudZhizhiId: user.zhizhiId,
      userZhizhiIdModified: user.zhizhiIdModified,
      isDifferent: zhizhiId !== user.zhizhiId
    })

    if (zhizhiId && !user.zhizhiIdModified && zhizhiId !== user.zhizhiId) {
      updateData.zhizhiId = zhizhiId
      updateData.zhizhiIdModified = true
      console.log('将更新知织ID:', zhizhiId, '(原ID:', user.zhizhiId, ')')
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
        avatarUrl: updateData.avatarUrl || user.avatarUrl,
        zhizhiId: updateData.zhizhiId || user.zhizhiId,
        zhizhiIdModified: updateData.zhizhiIdModified !== undefined ? updateData.zhizhiIdModified : user.zhizhiIdModified
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