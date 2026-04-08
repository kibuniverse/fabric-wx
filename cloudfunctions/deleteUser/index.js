// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const usersCollection = db.collection('users')
const diagramsCollection = db.collection('diagrams')

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 查询用户是否存在（兼容旧数据：先查 openid，再查 _openid）
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
        error: '用户不存在'
      }
    }

    // 删除用户数据
    const userId = userResult.data[0]._id
    const avatarUrl = userResult.data[0].avatarUrl

    // 删除用户的云存储头像
    if (avatarUrl && avatarUrl.startsWith('cloud://')) {
      try {
        await cloud.deleteFile({ fileList: [avatarUrl] })
      } catch (e) {
        console.warn('删除用户头像文件失败:', e)
      }
    }

    // 删除用户的图解数据（diagrams 集合）
    try {
      // 查询用户的所有图解
      const diagramsResult = await diagramsCollection.where({
        openid: openid
      }).get()

      // 收集需要删除的云文件ID
      const cloudFilesToDelete = []
      for (const diagram of diagramsResult.data) {
        // 收集封面图片
        if (diagram.cover && diagram.cover.startsWith('cloud://')) {
          cloudFilesToDelete.push(diagram.cover)
        }
        // 收集所有图片
        if (diagram.images && Array.isArray(diagram.images)) {
          for (const imageId of diagram.images) {
            if (imageId && imageId.startsWith('cloud://')) {
              cloudFilesToDelete.push(imageId)
            }
          }
        }
      }

      // 删除云存储文件
      if (cloudFilesToDelete.length > 0) {
        try {
          await cloud.deleteFile({ fileList: cloudFilesToDelete })
        } catch (e) {
          console.warn('删除图解云存储文件失败:', e)
        }
      }

      // 删除图解记录
      for (const diagram of diagramsResult.data) {
        await diagramsCollection.doc(diagram._id).remove()
      }

      console.log(`已删除 ${diagramsResult.data.length} 个图解`)
    } catch (e) {
      console.warn('删除图解数据失败:', e)
    }

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