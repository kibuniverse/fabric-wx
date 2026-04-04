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
        const updateData = {
            name: diagram.name,
            originalName: diagram.originalName,
            type: diagram.type,
            createTime: diagram.createTime,
            cover: diagram.cover,
            images: diagram.images || [],
            size: diagram.size,
            // 新增：计数器和备忘录数据同步
            counterData: diagram.counterData || { count: 0, updatedAt: now },
            memoContent: diagram.memoContent || '',
            updatedAt: now
        }
        if (diagram.lastAccessTime !== undefined) {
          updateData.lastAccessTime = diagram.lastAccessTime
        }
        await diagramsCollection.doc(existingResult.data[0]._id).update({
          data: updateData
        })

        return {
          success: true,
          data: {
            cloudId: existingResult.data[0]._id
          }
        }
      } else {
        // 创建新记录
        const addData = {
            openid: openid,
            id: diagram.id,
            name: diagram.name,
            originalName: diagram.originalName,
            type: diagram.type,
            createTime: diagram.createTime,
            cover: diagram.cover,
            images: diagram.images || [],
            size: diagram.size,
            // 新增：计数器和备忘录数据同步
            counterData: diagram.counterData || { count: 0, updatedAt: now },
            memoContent: diagram.memoContent || '',
            updatedAt: now
        }
        if (diagram.lastAccessTime !== undefined) {
          addData.lastAccessTime = diagram.lastAccessTime
        }
        const result = await diagramsCollection.add({
          data: addData
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

    // 检查云端是否有更新（用于跨设备同步）
    if (action === 'checkUpdate') {
      const { lastSyncTime, localDiagramCount } = event

      // 并行获取最新更新时间和图解数量
      const [latestResult, countResult] = await Promise.all([
        diagramsCollection.where({
          openid: openid
        }).orderBy('updatedAt', 'desc').limit(1).get(),
        diagramsCollection.where({
          openid: openid
        }).count()
      ])

      const diagramCount = countResult.total

      if (latestResult.data.length === 0) {
        // 云端无图解，但本地可能有已同步的图解（被其他设备删除了）
        const hasUpdate = localDiagramCount !== undefined && localDiagramCount > 0
        return {
          success: true,
          data: {
            hasUpdate,
            cloudUpdateTime: 0,
            diagramCount: 0
          }
        }
      }

      const cloudUpdateTime = latestResult.data[0].updatedAt ? new Date(latestResult.data[0].updatedAt).getTime() : 0
      const localSyncTime = lastSyncTime || 0

      // 通过时间戳或数量变化检测更新（数量变化可检测删除操作）
      const hasTimeUpdate = cloudUpdateTime > localSyncTime
      const hasCountChange = localDiagramCount !== undefined && localDiagramCount !== diagramCount

      return {
        success: true,
        data: {
          hasUpdate: hasTimeUpdate || hasCountChange,
          cloudUpdateTime,
          diagramCount
        }
      }
    }

    // 同步模式：基于 updatedAt 时间戳合并本地和云端数据
    if (action === 'sync') {
      // 1. 获取云端所有图解
      const cloudResult = await diagramsCollection.where({
        openid: openid
      }).get()

      const cloudDiagrams = cloudResult.data
      const cloudUpdateTime = cloudDiagrams.length > 0
        ? Math.max(...cloudDiagrams.map(d => d.updatedAt ? new Date(d.updatedAt).getTime() : 0))
        : 0

      return {
        success: true,
        data: {
          diagrams: cloudDiagrams,
          cloudUpdateTime,
          hasUpdate: true  // sync 调用时总是返回数据
        }
      }
    }

    // 更新图解部分信息（名称、封面、计数器、备忘录、图片顺序）
    if (action === 'updateInfo') {
      const { diagramId, name, cover, counterData, memoContent, images, lastAccessTime } = event

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

      // 构建更新对象（只更新传入的字段）
      const updateData = {
        updatedAt: now
      }
      if (name !== undefined) updateData.name = name
      if (cover !== undefined) updateData.cover = cover
      if (counterData !== undefined) updateData.counterData = counterData
      if (memoContent !== undefined) updateData.memoContent = memoContent
      if (lastAccessTime !== undefined) updateData.lastAccessTime = lastAccessTime

      // 新增：支持更新图片顺序
      if (images !== undefined) {
        updateData.images = images
        // 如果没有显式传 cover 且有图片，使用第一张图作为封面
        if (cover === undefined && images.length > 0) {
          updateData.cover = images[0]
        }
      }

      // 先执行更新
      await diagramsCollection.doc(diagramResult.data[0]._id).update({
        data: updateData
      })

      // 重新查询获取数据库实际写入的 updatedAt（db.serverDate() 的真实值）
      const updatedResult = await diagramsCollection.where({
        openid: openid,
        id: diagramId
      }).get()

      let serverUpdateTime = Date.now()
      if (updatedResult.data.length > 0 && updatedResult.data[0].updatedAt) {
        serverUpdateTime = new Date(updatedResult.data[0].updatedAt).getTime()
      }

      console.log('[updateInfo] 更新后的 updatedAt:', serverUpdateTime)

      return {
        success: true,
        message: '图解信息已更新',
        updatedAt: serverUpdateTime
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