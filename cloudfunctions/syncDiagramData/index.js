// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const diagramsCollection = db.collection('diagrams')

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { action, diagram } = event

  try {
    const now = db.serverDate()

    // 上传单个图解
    if (action === 'upload') {
      if (!diagram || !diagram.id) {
        return {
          success: false,
          error: '图解数据不完整'
        }
      }

      // 检查是否已存在（基于 id 字段）
      const existingResult = await diagramsCollection.where({
        openid: openid,
        id: diagram.id
      }).get()

      if (existingResult.data.length > 0) {
        // 更新已有记录
        await diagramsCollection.doc(existingResult.data[0]._id).update({
          data: {
            name: diagram.name,
            originalName: diagram.originalName,
            type: diagram.type,
            createTime: diagram.createTime,
            cover: diagram.cover,
            images: diagram.images || [],
            size: diagram.size,
            updatedAt: now
          }
        })

        return {
          success: true,
          data: {
            cloudId: existingResult.data[0]._id
          }
        }
      } else {
        // 创建新记录
        const result = await diagramsCollection.add({
          data: {
            openid: openid,
            id: diagram.id,
            name: diagram.name,
            originalName: diagram.originalName,
            type: diagram.type,
            createTime: diagram.createTime,
            cover: diagram.cover,
            images: diagram.images || [],
            size: diagram.size,
            updatedAt: now
          }
        })

        return {
          success: true,
          data: {
            cloudId: result._id
          }
        }
      }
    }

    // 下载所有图解
    if (action === 'download') {
      const result = await diagramsCollection.where({
        openid: openid
      }).orderBy('createTime', 'desc').get()

      return {
        success: true,
        data: {
          diagrams: result.data
        }
      }
    }

    // 删除单个图解
    if (action === 'delete') {
      const { diagramId } = event

      if (!diagramId) {
        return {
          success: false,
          error: '图解ID不能为空'
        }
      }

      // 查询图解
      const diagramResult = await diagramsCollection.where({
        openid: openid,
        id: diagramId
      }).get()

      if (diagramResult.data.length === 0) {
        return {
          success: false,
          error: '图解不存在'
        }
      }

      const diagramToDelete = diagramResult.data[0]

      // 收集需要删除的云文件ID
      const cloudFilesToDelete = []
      if (diagramToDelete.cover && diagramToDelete.cover.startsWith('cloud://')) {
        cloudFilesToDelete.push(diagramToDelete.cover)
      }
      if (diagramToDelete.images && Array.isArray(diagramToDelete.images)) {
        for (const imageId of diagramToDelete.images) {
          if (imageId && imageId.startsWith('cloud://')) {
            cloudFilesToDelete.push(imageId)
          }
        }
      }

      // 删除云存储文件
      if (cloudFilesToDelete.length > 0) {
        try {
          await cloud.deleteFile({ fileList: cloudFilesToDelete })
        } catch (e) {
          console.warn('删除云存储文件失败:', e)
        }
      }

      // 删除记录
      await diagramsCollection.doc(diagramToDelete._id).remove()

      return {
        success: true,
        message: '图解已删除'
      }
    }

    // 获取云端图解数量
    if (action === 'count') {
      const result = await diagramsCollection.where({
        openid: openid
      }).count()

      return {
        success: true,
        data: {
          count: result.total
        }
      }
    }

    return {
      success: false,
      error: '无效的操作类型'
    }

  } catch (error) {
    console.error('同步图解数据失败:', error)
    return {
      success: false,
      error: error.message || '同步失败'
    }
  }
}