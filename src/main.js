/**
 * Cesium 三维地图工作台
 *
 * 基于 CesiumJS 构建，加载天地图影像，提供侧边栏图层开关、
 * 亮度/对比度调节、预设视角飞行和截图导出功能。
 */

// ============================================================
// 1. 配置
// ============================================================
const CONFIG = {
  // ★ 请替换为你的天地图 Token（免费申请: https://www.tianditu.gov.cn）
  tiandituToken: 'cd4e1e7d1b953dcc46eac468e9bb2dd4',
};

// 获取基础路径（兼容开发环境和 GitHub Pages 部署）
const BASE_URL = import.meta.env.BASE_URL || '/';

// 设置 Cesium 静态资源路径（必须在 Cesium.js 加载前设置）
window.CESIUM_BASE_URL = BASE_URL + 'Cesium/';

// 北仑港区码头配置（模型坐标由用户提供）
const BEILUN_PORT = {
  name: '北仑港区码头',
  // 使用截图红十字读数作为模型锚点
  modelLng: 121.8891584873199,
  modelLat: 29.93293393444787,
  centerLng: 121.8891584873199,
  centerLat: 29.93293393444787,
  waterHeight: 0,
  modelHeightOffset: 2,
  west: 121.79,
  south: 29.874,
  east: 121.92,
  north: 29.945,
  waterGeoJsonUrl: BASE_URL + 'data/beilun-port.geojson',
};

// 海水效果默认参数（与 UI 滑块初始值一致）
const WATER_PARAMS = {
  opacity: 0.68,
  frequency: 1200,
  animationSpeed: 0.012,
  amplitude: 3.0,
  specularIntensity: 0.35,
};

// 预设视角
const PRESET_VIEWS = {
  beilun:  { lng: BEILUN_PORT.centerLng, lat: BEILUN_PORT.centerLat, alt: 600, heading: 0, pitch: -35 },
  china:   { lng: 110, lat: 35, alt: 3500000, heading: 0, pitch: -70 },
  north:   { lng: 116.4, lat: 39.9, alt: 500000, heading: 0, pitch: -60 },
  east:    { lng: 121.5, lat: 31.2, alt: 400000, heading: 10, pitch: -55 },
  south:   { lng: 113.3, lat: 23.1, alt: 400000, heading: -20, pitch: -50 },
  west:    { lng: 104.1, lat: 30.6, alt: 500000, heading: 15, pitch: -55 },
  default: { lng: 108, lat: 33, alt: 4500000, heading: 0, pitch: -75 },
};

// 天地图 URL 模板
//   img_w / cia_w = Web 墨卡托切片（tileMatrixSet=w），需 WebMercatorTilingScheme
//   开发环境通过 Vite 代理访问，生产环境直接访问天地图 HTTPS
const isDev = import.meta.env?.DEV ?? location.hostname === 'localhost';
const TIANDITU_TEMPLATE = {
  url: isDev
    ? '/tianditu/DataServer?T={style}&X={x}&Y={y}&L={z}&tk={token}'
    : 'https://t0.tianditu.gov.cn/DataServer?T={style}&X={x}&Y={y}&L={z}&tk={token}',
};

// ============================================================
// 2. 全局状态
// ============================================================
const CUSTOM_VIEWS_KEY = 'cesium_custom_views';
const MODEL_PARAMS_KEY = 'cesium_model_params';

const state = {
  viewer: null,
  scene: null,
  layers: {
    imagery: null,
    annotation: null,
  },
  tianjinDs: null,
  modelEntities: [],  // 3D 模型实体数组
  zhenhaiTileset: null,  // 镇海港区 3D Tiles
  savedViews: [],     // 保存的视角列表
  modelBasePosition: {  // 模型基准位置（拖拽后更新）
    lng: BEILUN_PORT.modelLng,
    lat: BEILUN_PORT.modelLat,
  },
  modelOffset: {  // 模型偏移量（东移/北移）
    east: 0,
    north: 0,
  },
  waterSurface: null,
  waterFill: null,
  waterMaterial: null,
  waterOutlines: [],
  portWaterHeight: 0,
};

// ============================================================
// 3. DOM 引用缓存
// ============================================================
const dom = {
  fps: $('fps-counter'),
  coords: $('status-coords'),
  camera: $('status-camera'),
  chkImagery: $('chk-imagery'),
  chkAnnotation: $('chk-annotation'),
  chkGlobe: $('chk-globe'),
  chkTianjin: $('chk-tianjin'),
  chkModel: $('chk-model'),
  chkZhenhai: $('chk-zhenhai'),
  chkWater: $('chk-water'),
  waterControls: $('water-controls'),
  waterOpacity: $('water-opacity'),
  waterFrequency: $('water-frequency'),
  waterSpeed: $('water-speed'),
  waterAmplitude: $('water-amplitude'),
  waterSpecular: $('water-specular'),
  waterOpacityVal: $('water-opacity-value'),
  waterFrequencyVal: $('water-frequency-value'),
  waterSpeedVal: $('water-speed-value'),
  waterAmplitudeVal: $('water-amplitude-value'),
  waterSpecularVal: $('water-specular-value'),
  brightness: $('slider-brightness'),
  contrast: $('slider-contrast'),
  brightnessVal: $('brightness-value'),
  contrastVal: $('contrast-value'),
  screenshot: $('btn-screenshot'),
  flyModel: $('btn-fly-model'),
  saveView: $('btn-save-view'),
  viewName: $('input-view-name'),
  viewList: $('view-list'),
  // 模型参数滑块
  modelHeading: $('slider-model-heading'),
  modelPitch: $('slider-model-pitch'),
  modelRoll: $('slider-model-roll'),
  modelScale: $('slider-model-scale'),
  modelHeight: $('slider-model-height'),
  modelEast: $('slider-model-east'),
  modelNorth: $('slider-model-north'),
  modelHeadingVal: $('model-heading-value'),
  modelPitchVal: $('model-pitch-value'),
  modelRollVal: $('model-roll-value'),
  modelScaleVal: $('model-scale-value'),
  modelHeightVal: $('model-height-value'),
  modelEastVal: $('model-east-value'),
  modelNorthVal: $('model-north-value'),
  resetModel: $('btn-reset-model'),
  saveModel: $('btn-save-model'),
};

function $(id) { return document.getElementById(id); }

// ============================================================
// 4. Viewer 初始化
// ============================================================
function initViewer() {
  const viewer = new Cesium.Viewer('viewer-container', {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    vrButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    timeline: false,
    navigationHelpButton: false,
    navigationInstructionsInitiallyVisible: false,
    imageryProvider: false,
    baseLayer: false,
    sceneMode: Cesium.SceneMode.SCENE3D,
    shadows: false,
    selectionIndicator: false,
  });

  const scene = viewer.scene;
  viewer.resolutionScale = window.devicePixelRatio || 1;

  // 场景配置
  scene.globe.showGroundAtmosphere = true;
  scene.globe.enableLighting = false;
  scene.globe.depthTestAgainstTerrain = false;

  // 相机约束
  const ctrl = scene.screenSpaceCameraController;
  ctrl.minimumZoomDistance = 1000;
  ctrl.maximumZoomDistance = 20000000;

  setupMapCursor(viewer);

  state.viewer = viewer;
  state.scene = scene;

  return { viewer, scene };
}

// ============================================================
// 4b. 地图拖拽光标（grab / grabbing）
// ============================================================
function setupMapCursor(viewer) {
  const canvas = viewer.scene.canvas;
  const handler = new Cesium.ScreenSpaceEventHandler(canvas);
  let dragging = false;

  const setGrab = () => { canvas.style.cursor = 'grab'; };
  const setGrabbing = () => { canvas.style.cursor = 'grabbing'; };

  setGrab();

  handler.setInputAction(() => {
    dragging = true;
    setGrabbing();
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction(() => {
    dragging = false;
    setGrab();
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  handler.setInputAction((movement) => {
    if (dragging) {
      setGrabbing();
      return;
    }
    const overGlobe = Cesium.defined(
      viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid)
    );
    canvas.style.cursor = overGlobe ? 'grab' : 'default';
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  return handler;
}

// ============================================================
// 5. 天地图影像加载（UrlTemplateImageryProvider）
// ============================================================
function makeTiandituProvider(style, token) {
  return new Cesium.UrlTemplateImageryProvider({
    url: TIANDITU_TEMPLATE.url
      .replace('{style}', style)
      .replace('{token}', token),
    // img_w / cia_w 使用墨卡托瓦片网格，必须与 WebMercatorTilingScheme 配对
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: 18,
    minimumLevel: 1,
    tileWidth: 256,
    tileHeight: 256,
  });
}

function loadTiandituLayers(viewer) {
  const token = CONFIG.tiandituToken;
  const log = (msg) => console.log('[Tianditu] ' + msg);

  // 影像底图（img_w = 墨卡托切片，配合 WebMercatorTilingScheme）
  let imagery;
  try {
    imagery = viewer.imageryLayers.addImageryProvider(
      makeTiandituProvider('img_w', token)
    );
    imagery.name = 'Tianditu Imagery';
    log('影像图层已添加');
  } catch (e) {
    log('影像图层添加失败: ' + e.message);
    imagery = null;
  }

  // 中文注记（cia_w = 墨卡托切片）
  let annotation;
  try {
    annotation = viewer.imageryLayers.addImageryProvider(
      makeTiandituProvider('cia_w', token)
    );
    annotation.name = 'Tianditu Annotation';
    log('注记图层已添加');
  } catch (e) {
    log('注记图层添加失败: ' + e.message);
    annotation = null;
  }

  // 错误监控
  let tileErrorCount = 0;
  const onTileError = (err) => {
    tileErrorCount++;
    console.warn('[Tianditu] 瓦片加载失败:', err);
    if (tileErrorCount === 1) {
      showToast('⚠️ 天地图瓦片加载失败，请检查网络或 Token 是否有效');
    }
  };
  if (imagery) imagery.errorEvent.addEventListener(onTileError);
  if (annotation) annotation.errorEvent.addEventListener(onTileError);

  // 监听瓦片加载完成，强制触发渲染
  viewer.scene.globe.tileLoadProgressEvent.addEventListener((queueLength) => {
    if (queueLength === 0) {
      viewer.scene.requestRender();
    }
  });

  state.layers.imagery = imagery;
  state.layers.annotation = annotation;

  return { imagery, annotation };
}

// ============================================================
// 6. 3D 模型加载（OBJ/glTF）
// ============================================================

// 模型配置 - 原始 OBJ 约 70~80m，scale=1 即真实尺寸
const MODEL_CONFIG = {
  longitude: BEILUN_PORT.modelLng,
  latitude: BEILUN_PORT.modelLat,
  height: 0,
  scale: 1.0,
  heading: 80,
  // 正立朝内翻转 90°，并略向下俯
  pitch: 120,
  roll: 10,
};

// OBJ 几何中心相对模型原点有偏移，加载时做锚点修正
const MODEL_LOCAL_CENTER_OFFSET = {
  x: -23.87025,
  y: 167.24895,
};

function offsetLngLatByMeters(lng, lat, eastMeters, northMeters) {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(Cesium.Math.toRadians(lat));
  return {
    lng: lng + eastMeters / metersPerDegLon,
    lat: lat + northMeters / metersPerDegLat,
  };
}

function computeModelAnchor(targetLng, targetLat, headingDeg, scale = 1) {
  const h = Cesium.Math.toRadians(headingDeg);
  const cx = MODEL_LOCAL_CENTER_OFFSET.x * scale;
  const cy = MODEL_LOCAL_CENTER_OFFSET.y * scale;
  // 模型中心向量旋转到 ENU 后，从目标点反推模型原点
  const east = cx * Math.cos(h) - cy * Math.sin(h);
  const north = cx * Math.sin(h) + cy * Math.cos(h);
  return offsetLngLatByMeters(targetLng, targetLat, -east, -north);
}

function getModelConfig() {
  const anchor = computeModelAnchor(
    BEILUN_PORT.modelLng,
    BEILUN_PORT.modelLat,
    MODEL_CONFIG.heading,
    MODEL_CONFIG.scale
  );
  return {
    ...MODEL_CONFIG,
    longitude: anchor.lng,
    latitude: anchor.lat,
    height: BEILUN_PORT.modelHeightOffset,
  };
}

// 所有模型文件列表及对应颜色
const MODEL_FILES = [
  { name: 'BL_obj_001_1', color: Cesium.Color.RED.withAlpha(0.9) },      // 红色
  { name: 'BL_obj_001_2', color: Cesium.Color.GREEN.withAlpha(0.9) },    // 绿色
  { name: 'BL_obj_001_3', color: Cesium.Color.BLUE.withAlpha(0.9) },     // 蓝色
  { name: 'BL_obj_005_1', color: Cesium.Color.YELLOW.withAlpha(0.9) },   // 黄色
  { name: 'BL_obj_005_2', color: Cesium.Color.CYAN.withAlpha(0.9) },     // 青色
];

function loadModel(viewer, modelUrl, color, config = MODEL_CONFIG) {
  const position = Cesium.Cartesian3.fromDegrees(
    config.longitude,
    config.latitude,
    config.height
  );

  const heading = Cesium.Math.toRadians(config.heading);
  const pitch = Cesium.Math.toRadians(config.pitch);
  const roll = Cesium.Math.toRadians(config.roll);
  const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, {
    heading,
    pitch,
    roll,
  });

  const entity = viewer.entities.add({
    name: modelUrl.split('/').pop().replace('.glb', ''),
    position: position,
    orientation: orientation,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    model: {
      uri: modelUrl,
      scale: config.scale,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      minimumPixelSize: 64,        // 最小像素大小，确保远处可见
      maximumScale: 20000,         // 最大缩放比例，防止近处过大
      color: color,
      colorBlendMode: Cesium.ColorBlendMode.MIX,
      colorBlendAmount: 0.35,
      silhouetteColor: Cesium.Color.WHITE,
      silhouetteSize: 0,
    },
  });

  console.log('[Model] 已加载:', modelUrl, 'scale:', config.scale);
  return entity;
}

// 加载所有模型
function loadAllModels(viewer, config = MODEL_CONFIG, flyToModel = true) {
  // 清除旧模型
  if (state.modelEntities && state.modelEntities.length > 0) {
    state.modelEntities.forEach(entity => viewer.entities.remove(entity));
  }
  state.modelEntities = [];

  // 加载所有模型文件（带错误处理，模型文件未部署时不会崩溃）
  let loadedCount = 0;
  MODEL_FILES.forEach(modelInfo => {
    const modelUrl = BASE_URL + `models/${modelInfo.name}.glb`;
    try {
      const entity = loadModel(viewer, modelUrl, modelInfo.color, config);
      state.modelEntities.push(entity);
      loadedCount++;
    } catch (e) {
      console.warn('[Model] 模型加载失败（可能未部署模型文件）:', modelUrl, e.message);
    }
  });

  // 只在首次加载且有模型成功加载时飞到模型位置
  if (flyToModel && loadedCount > 0) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        BEILUN_PORT.modelLng,
        BEILUN_PORT.modelLat,
        450
      ),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-40),
        roll: 0,
      },
      duration: 2.0,
    });
  }

  console.log('[Model] 所有模型已加载，共', loadedCount, '/', MODEL_FILES.length, '个');
  if (flyToModel && loadedCount > 0) {
    showToast(`✅ 已加载 ${loadedCount} 个模型（不同颜色）`);
  } else if (flyToModel) {
    console.info('[Model] 未找到模型文件，跳过模型加载');
  }

  return state.modelEntities;
}

// 方式2: 直接使用 Model API（适合不需要 Entity 交互的场景）
async function loadModelPrimitive(viewer, config = MODEL_CONFIG) {
  const position = Cesium.Cartesian3.fromDegrees(
    config.longitude,
    config.latitude,
    config.height
  );

  const heading = Cesium.Math.toRadians(config.heading);
  const pitch = Cesium.Math.toRadians(config.pitch);
  const roll = Cesium.Math.toRadians(config.roll);

  const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
    position,
    { heading, pitch, roll }
  );

  try {
    const model = await Cesium.Model.fromGltfAsync({
      url: config.url,
      modelMatrix: modelMatrix,
      scale: config.scale,
      minimumPixelSize: config.minimumPixelSize,
    });

    viewer.scene.primitives.add(model);
    console.log('[Model] Model primitive 已加载');
    return model;
  } catch (error) {
    console.error('[Model] 加载失败:', error);
    showToast('❌ 模型加载失败: ' + error.message);
    return null;
  }
}

// ============================================================
// 6b. 镇海港区 3D Tiles 模型
// ============================================================
const ZHENHAI_TILESET_URL = BASE_URL + 'models/镇海港区模型/tileset.json';

async function loadZhenhaiTileset(viewer) {
  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(ZHENHAI_TILESET_URL, {
      maximumScreenSpaceError: 16,       // 屏幕空间误差（越小越精细）
      maximumMemoryUsage: 512,           // 最大内存使用 MB
      dynamicScreenSpaceError: true,     // 动态屏幕空间误差
      dynamicScreenSpaceErrorDensity: 0.00278,
      dynamicScreenSpaceErrorFactor: 4.0,
    });

    viewer.scene.primitives.add(tileset);
    tileset.show = false;  // 默认不显示

    state.zhenhaiTileset = tileset;
    console.log('[Zhenhai] 镇海港区 3D Tiles 已加载');
    return tileset;
  } catch (error) {
    // 模型文件未部署时只显示警告，不显示错误提示
    console.warn('[Zhenhai] 加载失败（可能未部署模型文件）:', error.message);
    return null;
  }
}

// ============================================================
// 7. 天津区域边界（整体）+ 悬停高亮
// ============================================================

// 样式常量
const TJ_STYLE = {
  strokeColor: Cesium.Color.RED,
  strokeWidth: 3,
  fillHighlight: Cesium.Color.RED.withAlpha(0.25),    // 悬停高亮
};

async function loadTianjinBoundary(viewer) {
  // 120000.json = 天津市整体轮廓（不含内部区县分界线）
  const url = 'https://geo.datav.aliyun.com/areas_v3/bound/120000.json';

  // 近乎透明的填充色（alpha=1/255），肉眼不可见但 GPU pick 仍能拾取
  const FILL_INVISIBLE = Cesium.Color.fromBytes(0, 0, 0, 1);

  try {
    // 关闭 DataSource 默认描边，避免与自定义 outline 叠加
    const ds = await Cesium.GeoJsonDataSource.load(url, {
      stroke: false,
      fill: true,
    });
    ds.name = 'Tianjin Boundary';
    viewer.dataSources.add(ds);
    state.tianjinDs = ds;

    // 手动设置样式：红线 outline + 近透明填充（可 pick）
    // 过滤掉面积较小的飞地，只保留主城轮廓
    let mainEntity = null;
    let maxPositions = 0;
    for (const entity of ds.entities.values) {
      if (entity.polygon) {
        const hierarchy = entity.polygon.hierarchy.getValue();
        const count = hierarchy.positions.length;
        if (count > maxPositions) {
          maxPositions = count;
          mainEntity = entity;
        }
      }
    }
    // 删除飞地实体，只保留主城
    const toRemove = [];
    for (const entity of ds.entities.values) {
      if (entity.polygon && entity !== mainEntity) {
        toRemove.push(entity);
      }
    }
    toRemove.forEach((e) => ds.entities.remove(e));
    // 设置主城样式
    if (mainEntity) {
      mainEntity.polygon.material = FILL_INVISIBLE;
      mainEntity.polygon.outline = true;
      mainEntity.polygon.outlineColor = TJ_STYLE.strokeColor;
      mainEntity.polygon.outlineWidth = TJ_STYLE.strokeWidth;
      mainEntity.polygon.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
    }

    // 注册悬停交互
    setupTianjinHover(viewer, ds);

    console.log('[Tianjin] 边界图层已加载');
    return ds;
  } catch (e) {
    console.warn('[Tianjin] 边界加载失败:', e.message);
    showToast('⚠️ 天津边界加载失败，请检查网络');
    return null;
  }
}

// 鼠标悬停整体高亮
function setupTianjinHover(viewer, ds) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  let isHighlighted = false;

  // 近透明色（与加载时一致）
  const FILL_INVISIBLE = Cesium.Color.fromBytes(0, 0, 0, 1);

  // 取天津实体（只有一个）
  function getTjEntity() {
    for (const entity of ds.entities.values) {
      if (entity.polygon) return entity;
    }
    return null;
  }

  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.endPosition);
    const entity = Cesium.defined(picked) && Cesium.defined(picked.id)
      ? picked.id : null;
    const isOverTianjin = entity && ds.entities.contains(entity);

    const tj = getTjEntity();
    if (!tj) return;

    if (isOverTianjin && !isHighlighted) {
      // 鼠标进入天津 → 整体高亮
      tj.polygon.material = TJ_STYLE.fillHighlight;
      isHighlighted = true;
    } else if (!isOverTianjin && isHighlighted) {
      // 鼠标离开天津 → 恢复近透明
      tj.polygon.material = FILL_INVISIBLE;
      isHighlighted = false;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

// ============================================================
// 7. 鼠标坐标读取
// ============================================================
function setupMouseCoords(viewer) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((movement) => {
    const cartesian = viewer.camera.pickEllipsoid(
      movement.endPosition,
      viewer.scene.globe.ellipsoid
    );

    if (Cesium.defined(cartesian)) {
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lng = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      dom.coords.textContent = `坐标: ${lng.toFixed(4)}°E, ${lat.toFixed(4)}°N`;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  return handler;
}

// ============================================================
// 8. 镜头飞行
// ============================================================
function flyToView(viewer, viewKey) {
  const view = PRESET_VIEWS[viewKey];
  if (!view) return;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(view.lng, view.lat, view.alt),
    orientation: {
      heading: Cesium.Math.toRadians(view.heading),
      pitch: Cesium.Math.toRadians(view.pitch),
      roll: 0,
    },
    duration: 2.0,
    easingFunction: Cesium.EasingFunction.QUINTIC_IN_OUT,
  });
}

// ============================================================
// 9. 截图导出
// ============================================================
function captureScreenshot(viewer) {
  viewer.render();
  viewer.scene.render();

  setTimeout(() => {
    try {
      const canvas = viewer.scene.canvas;
      const dataUrl = canvas.toDataURL('image/png');

      const link = document.createElement('a');
      link.download = `cesium-screenshot-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('✅ 截图已保存');
    } catch (err) {
      showToast('❌ 截图失败: ' + err.message);
    }
  }, 100);
}

// ============================================================
// 10. FPS 与相机状态
// ============================================================
function setupFPS(viewer) {
  let lastTime = performance.now();
  let frames = 0;

  viewer.scene.postRender.addEventListener(() => {
    frames++;
    const now = performance.now();
    const delta = now - lastTime;
    if (delta >= 1000) {
      const fps = Math.round((frames * 1000) / delta);
      dom.fps.textContent = `${fps} FPS`;
      frames = 0;
      lastTime = now;
    }
  });

  setInterval(updateCameraStatus, 500);
}

function updateCameraStatus() {
  const camera = state.viewer?.camera;
  if (!camera) return;

  const carto = Cesium.Cartographic.fromCartesian(camera.position);
  const lng = Cesium.Math.toDegrees(carto.longitude);
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const alt = carto.height;
  const heading = Cesium.Math.toDegrees(camera.heading);
  const pitch = Cesium.Math.toDegrees(camera.pitch);

  dom.camera.textContent =
    `视角: ${lng.toFixed(1)}°E, ${lat.toFixed(1)}°N, ${formatHeight(alt)} | ` +
    `航向 ${heading.toFixed(0)}° 俯仰 ${(-pitch).toFixed(0)}°`;
}

function formatHeight(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1) + 'km';
  return meters.toFixed(0) + 'm';
}

// ============================================================
// 11. 侧边栏事件
// ============================================================
function bindSidebarControls() {
  const viewer = state.viewer;
  const scene = state.scene;
  const globe = scene.globe;

  // 图层开关
  dom.chkImagery.addEventListener('change', () => {
    const layer = state.layers.imagery;
    if (layer) layer.show = dom.chkImagery.checked;
  });
  dom.chkAnnotation.addEventListener('change', () => {
    const layer = state.layers.annotation;
    if (layer) layer.show = dom.chkAnnotation.checked;
  });
  dom.chkGlobe.addEventListener('change', () => {
    globe.show = dom.chkGlobe.checked;
  });
  dom.chkTianjin.addEventListener('change', () => {
    if (state.tianjinDs) state.tianjinDs.show = dom.chkTianjin.checked;
  });
  dom.chkModel.addEventListener('change', () => {
    if (state.modelEntities && state.modelEntities.length > 0) {
      state.modelEntities.forEach(entity => {
        entity.show = dom.chkModel.checked;
      });
    }
  });
  dom.chkZhenhai.addEventListener('change', async () => {
    if (dom.chkZhenhai.checked) {
      // 首次加载
      if (!state.zhenhaiTileset) {
        showToast('📦 正在加载镇海港区模型...');
        await loadZhenhaiTileset(viewer);
      }
      if (state.zhenhaiTileset) {
        state.zhenhaiTileset.show = true;
        showToast('✅ 镇海港区模型已显示');

        // 飞到模型位置（从 tileset.json 的 region 计算中心点）
        // region: [west, south, east, north, minHeight, maxHeight] (弧度)
        const west = 2.0313438265278387;
        const south = 0.6963729325104971;
        const east = 2.0316928923782376;
        const north = 0.696721998360896;
        const centerLng = Cesium.Math.toDegrees((west + east) / 2);
        const centerLat = Cesium.Math.toDegrees((south + north) / 2);

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(centerLng, centerLat, 2000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
          },
          duration: 2.0,
        });
      }
    } else {
      if (state.zhenhaiTileset) {
        state.zhenhaiTileset.show = false;
        showToast('镇海港区模型已隐藏');
      }
    }
  });
  dom.chkWater.addEventListener('change', async () => {
    if (dom.chkWater.checked) {
      try {
        await ensureWaterSurface(viewer);
        state.waterSurface.show = true;
        if (state.waterFill) state.waterFill.show = true;
        setPortWaterOutlinesVisible(true);
        setWaterControlsVisible(true);
        showToast('🌊 海水效果已开启');
      } catch (err) {
        console.error('[Water] 加载失败:', err);
        dom.chkWater.checked = false;
        setWaterControlsVisible(false);
        showToast('❌ 港区水域加载失败');
      }
    } else {
      if (state.waterSurface) {
        state.waterSurface.show = false;
      }
      if (state.waterFill) {
        state.waterFill.show = false;
      }
      setPortWaterOutlinesVisible(false);
      setWaterControlsVisible(false);
      showToast('🌊 海水效果已关闭');
    }
  });

  bindWaterControls(viewer);

  // 亮度/对比度
  dom.brightness.addEventListener('input', () => {
    const val = parseFloat(dom.brightness.value);
    dom.brightnessVal.textContent = val.toFixed(2);
    if (state.layers.imagery) state.layers.imagery.brightness = val;
  });
  dom.contrast.addEventListener('input', () => {
    const val = parseFloat(dom.contrast.value);
    dom.contrastVal.textContent = val.toFixed(2);
    if (state.layers.imagery) state.layers.imagery.contrast = val;
  });

  // 预设视角
  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => flyToView(viewer, btn.dataset.view));
  });

  // 截图
  dom.screenshot.addEventListener('click', () => captureScreenshot(viewer));

  // 飞到模型
  dom.flyModel.addEventListener('click', () => {
    if (state.savedViews.length > 0) {
      // 飞到第一个保存的视角
      flyToSavedView(viewer, state.savedViews[0]);
      showToast('🎯 飞到视角: ' + state.savedViews[0].name);
    } else if (state.modelEntities && state.modelEntities.length > 0) {
      // 飞到第一个模型
      viewer.flyTo(state.modelEntities[0], {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-45),
          5000
        ),
      });
      showToast('🎯 飞到模型');
    } else {
      showToast('⚠️ 模型未加载');
    }
  });

  // 保存当前视角
  dom.saveView.addEventListener('click', () => {
    const name = dom.viewName.value.trim() || `视角 ${state.savedViews.length + 1}`;
    saveCurrentView(viewer, name);
    dom.viewName.value = '';
  });

  // 模型参数调节
  bindModelControls(viewer);
}

// 绑定模型参数滑块
function bindModelControls(viewer) {
  function applyModelParams() {
    const heading = parseFloat(dom.modelHeading.value);
    const pitch = parseFloat(dom.modelPitch.value);
    const roll = parseFloat(dom.modelRoll.value);
    const scale = parseFloat(dom.modelScale.value);
    const height = parseFloat(dom.modelHeight.value);

    // 更新显示值
    dom.modelHeadingVal.textContent = heading + '°';
    dom.modelPitchVal.textContent = pitch + '°';
    dom.modelRollVal.textContent = roll + '°';
    dom.modelScaleVal.textContent = scale.toFixed(1);
    dom.modelHeightVal.textContent = height + 'm';

    // 使用基准位置 + 偏移量计算目标位置
    const baseLng = state.modelBasePosition.lng;
    const baseLat = state.modelBasePosition.lat;
    const metersPerDegLon = 111320 * Math.cos(Cesium.Math.toRadians(baseLat));
    const targetLng = baseLng + state.modelOffset.east / metersPerDegLon;
    const targetLat = baseLat + state.modelOffset.north / 111320;

    // 更新 BEILUN_PORT 坐标
    BEILUN_PORT.modelLng = targetLng;
    BEILUN_PORT.modelLat = targetLat;

    // 构建配置（直接使用目标位置，不计算锚点偏移）
    const cfg = {
      longitude: targetLng,
      latitude: targetLat,
      height: height,
      scale: scale,
      heading: heading,
      pitch: pitch,
      roll: roll,
    };

    // 调整参数时不飞行，保持当前视角
    loadAllModels(viewer, cfg, false);
  }

  // 节流函数，避免滑块拖动时频繁加载模型
  let throttleTimer = null;
  function throttledApply() {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
      applyModelParams();
      throttleTimer = null;
    }, 100);
  }

  // 绑定滑块事件
  dom.modelHeading.addEventListener('input', throttledApply);
  dom.modelPitch.addEventListener('input', throttledApply);
  dom.modelRoll.addEventListener('input', throttledApply);
  dom.modelScale.addEventListener('input', throttledApply);
  dom.modelHeight.addEventListener('input', throttledApply);

  // 东移/北移
  dom.modelEast.addEventListener('input', () => {
    state.modelOffset.east = parseFloat(dom.modelEast.value);
    dom.modelEastVal.textContent = state.modelOffset.east + 'm';
    throttledApply();
  });

  dom.modelNorth.addEventListener('input', () => {
    state.modelOffset.north = parseFloat(dom.modelNorth.value);
    dom.modelNorthVal.textContent = state.modelOffset.north + 'm';
    throttledApply();
  });

  // 重置按钮
  dom.resetModel.addEventListener('click', () => {
    dom.modelHeading.value = MODEL_CONFIG.heading;
    dom.modelPitch.value = MODEL_CONFIG.pitch;
    dom.modelRoll.value = MODEL_CONFIG.roll;
    dom.modelScale.value = MODEL_CONFIG.scale;
    dom.modelHeight.value = 2;  // 默认高度
    dom.modelEast.value = 0;
    dom.modelNorth.value = 0;
    state.modelOffset.east = 0;
    state.modelOffset.north = 0;

    // 重置基准位置和锚点
    state.modelBasePosition.lng = 121.8891584873199;
    state.modelBasePosition.lat = 29.93293393444787;
    BEILUN_PORT.modelLng = state.modelBasePosition.lng;
    BEILUN_PORT.modelLat = state.modelBasePosition.lat;

    applyModelParams();
    showToast('↺ 模型参数已重置');
  });

  // 保存参数按钮
  dom.saveModel.addEventListener('click', () => {
    const params = {
      heading: parseFloat(dom.modelHeading.value),
      pitch: parseFloat(dom.modelPitch.value),
      roll: parseFloat(dom.modelRoll.value),
      scale: parseFloat(dom.modelScale.value),
      height: parseFloat(dom.modelHeight.value),
      eastOffset: state.modelOffset.east,
      northOffset: state.modelOffset.north,
      modelLng: BEILUN_PORT.modelLng,
      modelLat: BEILUN_PORT.modelLat,
    };
    localStorage.setItem(MODEL_PARAMS_KEY, JSON.stringify(params));
    showToast('💾 模型参数已保存');
    console.log('[Model] 参数已保存:', params);
  });

  // 从 localStorage 加载保存的参数
  function loadSavedParams() {
    try {
      const data = localStorage.getItem(MODEL_PARAMS_KEY);
      if (!data) return false;
      const params = JSON.parse(data);

      // 更新滑块值
      dom.modelHeading.value = params.heading;
      dom.modelPitch.value = params.pitch;
      dom.modelRoll.value = params.roll;
      dom.modelScale.value = params.scale;
      dom.modelHeight.value = params.height;
      dom.modelEast.value = params.eastOffset || 0;
      dom.modelNorth.value = params.northOffset || 0;

      // 更新偏移量
      state.modelOffset.east = params.eastOffset || 0;
      state.modelOffset.north = params.northOffset || 0;

      // 更新基准位置和锚点
      if (params.modelLng && params.modelLat) {
        state.modelBasePosition.lng = params.modelLng;
        state.modelBasePosition.lat = params.modelLat;
        BEILUN_PORT.modelLng = params.modelLng;
        BEILUN_PORT.modelLat = params.modelLat;
      }

      console.log('[Model] 已加载保存的参数:', params);
      return true;
    } catch (e) {
      console.error('[Model] 加载参数失败:', e);
      return false;
    }
  }

  // 初始化：尝试加载保存的参数，否则使用默认值
  if (loadSavedParams()) {
    applyModelParams();
    showToast('📦 已加载保存的模型参数');
  } else {
    // 使用默认值
    dom.modelHeadingVal.textContent = MODEL_CONFIG.heading + '°';
    dom.modelPitchVal.textContent = MODEL_CONFIG.pitch + '°';
    dom.modelRollVal.textContent = MODEL_CONFIG.roll + '°';
    dom.modelScaleVal.textContent = MODEL_CONFIG.scale.toFixed(1);
    dom.modelHeightVal.textContent = '2m';
    dom.modelEastVal.textContent = '0m';
    dom.modelNorthVal.textContent = '0m';
  }
}

// 显示/隐藏海水参数面板
function setWaterControlsVisible(visible) {
  if (dom.waterControls) {
    dom.waterControls.classList.toggle('hidden', !visible);
  }
}

// 将 UI 参数同步到 Water 材质
function applyWaterParams(viewer) {
  if (!state.waterMaterial) return;

  const u = state.waterMaterial.uniforms;
  u.baseWaterColor = new Cesium.Color(0.1, 0.42, 0.72, WATER_PARAMS.opacity);
  u.blendColor = new Cesium.Color(0.0, 0.55, 0.85, WATER_PARAMS.opacity * 0.5);
  u.frequency = WATER_PARAMS.frequency;
  u.animationSpeed = WATER_PARAMS.animationSpeed;
  u.amplitude = WATER_PARAMS.amplitude;
  u.specularIntensity = WATER_PARAMS.specularIntensity;

  viewer?.scene.requestRender();
}

// 绑定海水参数滑块
function bindWaterControls(viewer) {
  const sliders = [
    {
      el: dom.waterOpacity,
      valEl: dom.waterOpacityVal,
      key: 'opacity',
      format: (v) => v.toFixed(2),
      parse: parseFloat,
    },
    {
      el: dom.waterFrequency,
      valEl: dom.waterFrequencyVal,
      key: 'frequency',
      format: (v) => String(Math.round(v)),
      parse: (v) => parseFloat(v),
    },
    {
      el: dom.waterSpeed,
      valEl: dom.waterSpeedVal,
      key: 'animationSpeed',
      format: (v) => v.toFixed(3),
      parse: parseFloat,
    },
    {
      el: dom.waterAmplitude,
      valEl: dom.waterAmplitudeVal,
      key: 'amplitude',
      format: (v) => v.toFixed(1),
      parse: parseFloat,
    },
    {
      el: dom.waterSpecular,
      valEl: dom.waterSpecularVal,
      key: 'specularIntensity',
      format: (v) => v.toFixed(2),
      parse: parseFloat,
    },
  ];

  sliders.forEach(({ el, valEl, key, format, parse }) => {
    if (!el) return;
    el.addEventListener('input', () => {
      const val = parse(el.value);
      WATER_PARAMS[key] = val;
      if (valEl) valEl.textContent = format(val);
      applyWaterParams(viewer);
    });
  });
}

// GeoJSON 坐标环 → Cesium PolygonHierarchy
function ringToPositions(ring) {
  const flat = [];
  for (const [lng, lat] of ring) {
    flat.push(lng, lat);
  }
  return Cesium.Cartesian3.fromDegreesArray(flat);
}

function signedRingArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function normalizeOuterRing(ring) {
  if (!ring || ring.length < 4) return null;
  const closed =
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice()
      : [...ring, ring[0]];
  // Cesium 外环逆时针（从上往下看）
  return signedRingArea(closed) < 0 ? closed.reverse() : closed;
}

function buildPolygonHierarchy(rings) {
  const outer = normalizeOuterRing(rings[0]);
  if (!outer) return null;
  const holes = rings.slice(1)
    .map(normalizeOuterRing)
    .filter(Boolean)
    .map((hole) => {
      const h = signedRingArea(hole) > 0 ? hole.reverse() : hole;
      return new Cesium.PolygonHierarchy(ringToPositions(h));
    });
  return new Cesium.PolygonHierarchy(ringToPositions(outer), holes);
}

function collectPolygonRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

async function loadPortWaterGeoJson() {
  const resp = await fetch(BEILUN_PORT.waterGeoJsonUrl);
  if (!resp.ok) throw new Error(`港区水域数据 HTTP ${resp.status}`);
  return resp.json();
}

function buildLocalWaterRing(centerLng, centerLat, radiusMeters = 320, segments = 96) {
  const ring = [];
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(Cesium.Math.toRadians(centerLat));
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const east = Math.cos(t) * radiusMeters;
    const north = Math.sin(t) * radiusMeters * 0.85;
    ring.push([
      centerLng + east / metersPerDegLon,
      centerLat + north / metersPerDegLat,
    ]);
  }
  return ring;
}

function buildWaterMaterial() {
  return Cesium.Material.fromType('Water', {
    baseWaterColor: new Cesium.Color(0.1, 0.42, 0.72, WATER_PARAMS.opacity),
    blendColor: new Cesium.Color(0.0, 0.55, 0.85, WATER_PARAMS.opacity * 0.5),
    normalMap: Cesium.buildModuleUrl('Assets/Textures/waterNormals.jpg'),
    frequency: WATER_PARAMS.frequency,
    animationSpeed: WATER_PARAMS.animationSpeed,
    amplitude: WATER_PARAMS.amplitude,
    specularIntensity: WATER_PARAMS.specularIntensity,
  });
}

// 按北仑港区 OSM 水域边界创建水面
async function createWaterSurface(viewer) {
  const ring = buildLocalWaterRing(BEILUN_PORT.modelLng, BEILUN_PORT.modelLat);
  const hierarchy = new Cesium.PolygonHierarchy(ringToPositions(ring));
  const waterMaterial = buildWaterMaterial();
  state.waterMaterial = waterMaterial;

  const waterHeight = state.portWaterHeight;
  const instances = [new Cesium.GeometryInstance({
    geometry: new Cesium.PolygonGeometry({
      polygonHierarchy: hierarchy,
      height: waterHeight,
      vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
    }),
  })];
  const fillInstances = [new Cesium.GeometryInstance({
    geometry: new Cesium.PolygonGeometry({
      polygonHierarchy: hierarchy,
      height: waterHeight + 0.2,
      vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
    }),
  })];

  // 底层蓝色填充（保证水面可见）
  state.waterFill = new Cesium.Primitive({
    geometryInstances: fillInstances,
    appearance: new Cesium.EllipsoidSurfaceAppearance({
      material: Cesium.Material.fromType('Color', {
        color: new Cesium.Color(0.12, 0.48, 0.82, 0.55),
      }),
      aboveGround: false,
      translucent: true,
    }),
    asynchronous: false,
  });
  viewer.scene.primitives.add(state.waterFill);

  const waterPrimitive = new Cesium.Primitive({
    geometryInstances: instances,
    appearance: new Cesium.EllipsoidSurfaceAppearance({
      material: waterMaterial,
      aboveGround: false,
      translucent: true,
    }),
    asynchronous: false,
  });

  viewer.scene.primitives.add(waterPrimitive);
  createPortWaterOutlines(viewer, ring);
  console.log('[Water] 模型周边水面已创建，中心:', BEILUN_PORT.modelLng, BEILUN_PORT.modelLat);
  return waterPrimitive;
}

function createPortWaterOutlines(viewer, ring) {
  removePortWaterOutlines(viewer);
  const flat = ring.flatMap(([lng, lat]) => [lng, lat]);
  const entity = viewer.entities.add({
    name: '模型周边水面范围',
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray(flat),
      width: 4,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.15,
        color: Cesium.Color.CYAN.withAlpha(0.9),
      }),
      clampToGround: true,
    },
  });
  state.waterOutlines.push(entity);
}

function removePortWaterOutlines(viewer) {
  if (!state.waterOutlines.length) return;
  state.waterOutlines.forEach((e) => viewer.entities.remove(e));
  state.waterOutlines = [];
}

function setPortWaterOutlinesVisible(visible) {
  state.waterOutlines.forEach((e) => { e.show = visible; });
}

async function initPortHeights(viewer) {
  // 与影像严格贴合，固定椭球高度 0
  state.portWaterHeight = BEILUN_PORT.waterHeight;
  console.log('[Port] 水面高度', state.portWaterHeight, 'm');
}

async function ensureWaterSurface(viewer) {
  if (!state.waterSurface) {
    showToast('🌊 正在加载港区水域...');
    state.waterSurface = await createWaterSurface(viewer);
  }
  return state.waterSurface;
}

// ============================================================
// 视角管理 - localStorage 持久化
// ============================================================

// 从 localStorage 加载视角
function loadViewsFromStorage() {
  try {
    const data = localStorage.getItem(CUSTOM_VIEWS_KEY);
    if (!data) return [];
    const views = JSON.parse(data);
    // 将 {x,y,z} 转换回 Cartesian3 对象
    return views.map(v => ({
      id: v.id,
      name: v.name,
      destination: new Cesium.Cartesian3(v.destination.x, v.destination.y, v.destination.z),
      orientation: v.orientation,
    }));
  } catch (e) {
    console.error('[View] 加载视角失败:', e);
    return [];
  }
}

// 保存视角到 localStorage
function saveViewsToStorage() {
  try {
    // 将 Cartesian3 转换为普通对象 {x,y,z} 再序列化
    const views = state.savedViews.map(v => ({
      id: v.id,
      name: v.name,
      destination: { x: v.destination.x, y: v.destination.y, z: v.destination.z },
      orientation: v.orientation,
    }));
    localStorage.setItem(CUSTOM_VIEWS_KEY, JSON.stringify(views));
    console.log('[View] 已保存到 localStorage，共', views.length, '个视角');
  } catch (e) {
    console.error('[View] 保存到 localStorage 失败:', e);
  }
}

// 保存当前视角
function saveCurrentView(viewer, name) {
  const camera = viewer.camera;
  const view = {
    id: Date.now(),
    name: name,
    destination: Cesium.Cartesian3.clone(camera.position),
    orientation: {
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
    },
  };

  state.savedViews.push(view);
  saveViewsToStorage();  // 持久化到 localStorage
  renderViewList(viewer);
  showToast(`✅ 视角 "${name}" 已保存`);
  console.log('[View] 已保存视角:', view);
}

// 飞到保存的视角
function flyToSavedView(viewer, view) {
  viewer.camera.flyTo({
    destination: view.destination,
    orientation: view.orientation,
    duration: 1.5,
  });
}

// 删除视角
function deleteView(viewer, id) {
  state.savedViews = state.savedViews.filter(v => v.id !== id);
  saveViewsToStorage();  // 持久化到 localStorage
  renderViewList(viewer);
  showToast('🗑️ 视角已删除');
}

// 渲染视角列表
function renderViewList(viewer) {
  const list = dom.viewList;
  list.innerHTML = '';

  if (state.savedViews.length === 0) {
    list.innerHTML = '<div class="view-item" style="color:var(--text-dim);justify-content:center">暂无保存的视角</div>';
    return;
  }

  state.savedViews.forEach((view, index) => {
    const item = document.createElement('div');
    item.className = 'view-item';
    item.innerHTML = `
      <span class="view-item-name" title="${view.name}">${view.name}</span>
      <div class="view-item-actions">
        <button class="view-item-btn fly" data-id="${view.id}" title="飞到此视角">🎯</button>
        <button class="view-item-btn delete" data-id="${view.id}" title="删除">🗑️</button>
      </div>
    `;
    list.appendChild(item);
  });

  // 绑定事件
  list.querySelectorAll('.view-item-btn.fly').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const view = state.savedViews.find(v => v.id === id);
      if (view) {
        flyToSavedView(viewer, view);
        showToast('🎯 飞到视角: ' + view.name);
      }
    });
  });

  list.querySelectorAll('.view-item-btn.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      deleteView(viewer, id);
    });
  });

  // 点击整个项目也可以飞到
  list.querySelectorAll('.view-item').forEach(item => {
    item.addEventListener('click', () => {
      const flyBtn = item.querySelector('.view-item-btn.fly');
      if (flyBtn) flyBtn.click();
    });
  });
}

// ============================================================
// 12. Toast
// ============================================================
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============================================================
// 13. 窗口自适应
// ============================================================
function setupResize(viewer) {
  window.addEventListener('resize', () => viewer.resize());
}

// ============================================================
// 14. 启动
// ============================================================
async function main() {
  try {
    showToast('🚀 正在初始化 Cesium 场景...');

    const { viewer } = initViewer();
    showToast('🌐 场景已就绪，正在加载数据...');

    loadTiandituLayers(viewer);
    await loadTianjinBoundary(viewer);
    await initPortHeights(viewer);

    loadAllModels(viewer, getModelConfig());

    // 默认开启港区水面
    await ensureWaterSurface(viewer);
    setPortWaterOutlinesVisible(true);
    dom.chkWater.checked = true;

    setupMouseCoords(viewer);
    bindSidebarControls();
    setWaterControlsVisible(true);
    setupResize(viewer);
    setupFPS(viewer);

    // 从 localStorage 加载已保存的视角
    state.savedViews = loadViewsFromStorage();
    console.log('[View] 从 localStorage 加载了', state.savedViews.length, '个视角');

    // 初始化视角列表
    renderViewList(viewer);

    setTimeout(() => {
      flyToView(viewer, 'beilun');
      showToast('✅ 加载完成 — 模型已置于北仑港区水面');
    }, 500);

    // 初始化模型调试工具
    setupModelDebugTools(viewer);

    // 初始化模型拖拽功能
    setupModelDragHandler(viewer);
  } catch (err) {
    console.error('[Cesium] 启动失败:', err);
    showToast('❌ 启动失败: ' + (err.message || err));
  }
}

// ============================================================
// 16. 模型拖拽功能
// ============================================================
function setupModelDragHandler(viewer) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  let isDragging = false;
  let draggedEntity = null;
  let dragOffset = new Cesium.Cartesian3();

  // 鼠标按下：检测是否点击到模型
  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);

    if (Cesium.defined(picked) && picked.id && state.modelEntities.includes(picked.id)) {
      isDragging = true;
      draggedEntity = picked.id;
      viewer.scene.screenSpaceCameraController.enableInputs = false;

      // 计算点击位置与模型位置的偏移
      const clickPosition = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (clickPosition && draggedEntity.position) {
        const modelPosition = draggedEntity.position.getValue(Cesium.JulianDate.now());
        if (modelPosition) {
          Cesium.Cartesian3.subtract(modelPosition, clickPosition, dragOffset);
        }
      }

      // 高亮选中的模型
      if (draggedEntity.model) {
        draggedEntity.model.silhouetteSize = 3;
        draggedEntity.model.silhouetteColor = Cesium.Color.YELLOW;
      }

      showToast('🎯 已选中模型，拖拽移动位置');
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  // 鼠标移动：更新模型位置
  handler.setInputAction((movement) => {
    if (!isDragging || !draggedEntity) return;

    const newPosition = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
    if (newPosition) {
      // 加上偏移
      const finalPosition = Cesium.Cartesian3.add(newPosition, dragOffset, new Cesium.Cartesian3());
      draggedEntity.position = finalPosition;
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // 鼠标释放：结束拖拽
  handler.setInputAction(() => {
    if (isDragging && draggedEntity) {
      // 恢复模型样式
      if (draggedEntity.model) {
        draggedEntity.model.silhouetteSize = 0;
      }

      // 更新 BEILUN_PORT 坐标为新位置
      const newPosition = draggedEntity.position.getValue(Cesium.JulianDate.now());
      if (newPosition) {
        const carto = Cesium.Cartographic.fromCartesian(newPosition);
        BEILUN_PORT.modelLng = Cesium.Math.toDegrees(carto.longitude);
        BEILUN_PORT.modelLat = Cesium.Math.toDegrees(carto.latitude);

        // 同步移动其他模型
        syncModelPositions(draggedEntity);

        // 更新 UI 滑块显示
        updateModelUIFromPosition();

        console.log('[Model] 已移动到:', BEILUN_PORT.modelLng, BEILUN_PORT.modelLat);
        showToast('✅ 模型位置已更新');
      }
    }

    isDragging = false;
    draggedEntity = null;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  console.log('[Model] 拖拽功能已启用 - 点击模型拖拽移动');
}

// 同步所有模型到相同位置
function syncModelPositions(sourceEntity) {
  const newPosition = sourceEntity.position.getValue(Cesium.JulianDate.now());
  if (!newPosition) return;

  state.modelEntities.forEach(entity => {
    if (entity !== sourceEntity) {
      entity.position = newPosition;
    }
  });
}

// 根据当前位置更新 UI 滑块和基准位置
function updateModelUIFromPosition() {
  // 更新基准位置为当前位置
  state.modelBasePosition.lng = BEILUN_PORT.modelLng;
  state.modelBasePosition.lat = BEILUN_PORT.modelLat;

  // 重置偏移量为 0（因为已经直接移动了位置）
  state.modelOffset.east = 0;
  state.modelOffset.north = 0;

  // 更新 UI
  if (dom.modelEast) {
    dom.modelEast.value = 0;
    dom.modelEastVal.textContent = '0m';
  }
  if (dom.modelNorth) {
    dom.modelNorth.value = 0;
    dom.modelNorthVal.textContent = '0m';
  }
}

// ============================================================
// 17. 模型调试工具（控制台使用）
// ============================================================
function setupModelDebugTools(viewer) {
  window.debugModel = {
    // 设置航向角（绕垂直轴旋转，0=北，90=东）
    setHeading(deg) {
      const cfg = getModelConfig();
      cfg.heading = deg;
      loadAllModels(viewer, cfg);
      console.log(`[Debug] heading = ${deg}°`);
      return cfg;
    },

    // 设置俯仰角
    setPitch(deg) {
      const cfg = getModelConfig();
      cfg.pitch = deg;
      loadAllModels(viewer, cfg);
      console.log(`[Debug] pitch = ${deg}°`);
      return cfg;
    },

    // 设置翻滚角
    setRoll(deg) {
      const cfg = getModelConfig();
      cfg.roll = deg;
      loadAllModels(viewer, cfg);
      console.log(`[Debug] roll = ${deg}°`);
      return cfg;
    },

    // 同时设置三个旋转角
    setRotation(heading, pitch, roll) {
      const cfg = getModelConfig();
      cfg.heading = heading;
      cfg.pitch = pitch;
      cfg.roll = roll;
      loadAllModels(viewer, cfg);
      console.log(`[Debug] rotation = (${heading}°, ${pitch}°, ${roll}°)`);
      return cfg;
    },

    // 设置缩放比例
    setScale(scale) {
      const cfg = getModelConfig();
      cfg.scale = scale;
      loadAllModels(viewer, cfg);
      console.log(`[Debug] scale = ${scale}`);
      return cfg;
    },

    // 设置高度偏移（米）
    setHeight(height) {
      const cfg = getModelConfig();
      cfg.height = height;
      loadAllModels(viewer, cfg);
      console.log(`[Debug] height = ${height}m`);
      return cfg;
    },

    // 设置模型位置（经纬度）
    setPosition(lng, lat) {
      BEILUN_PORT.modelLng = lng;
      BEILUN_PORT.modelLat = lat;
      loadAllModels(viewer, getModelConfig());
      console.log(`[Debug] position = (${lng}, ${lat})`);
    },

    // 微调位置（相对移动，单位米）
    moveEast(meters) {
      const metersPerDeg = 111320 * Math.cos(Cesium.Math.toRadians(BEILUN_PORT.modelLat));
      BEILUN_PORT.modelLng += meters / metersPerDeg;
      loadAllModels(viewer, getModelConfig());
      console.log(`[Debug] 向东移动 ${meters}m → lng = ${BEILUN_PORT.modelLng}`);
    },

    moveNorth(meters) {
      BEILUN_PORT.modelLat += meters / 111320;
      loadAllModels(viewer, getModelConfig());
      console.log(`[Debug] 向北移动 ${meters}m → lat = ${BEILUN_PORT.modelLat}`);
    },

    // 重置为默认配置
    reset() {
      BEILUN_PORT.modelLng = 121.8891584873199;
      BEILUN_PORT.modelLat = 29.93293393444787;
      loadAllModels(viewer, MODEL_CONFIG);
      console.log('[Debug] 已重置为默认配置');
    },

    // 打印当前配置
    info() {
      const cfg = getModelConfig();
      console.table({
        '锚点经度': BEILUN_PORT.modelLng,
        '锚点纬度': BEILUN_PORT.modelLat,
        '模型经度': cfg.longitude,
        '模型纬度': cfg.latitude,
        '高度': cfg.height,
        '缩放': cfg.scale,
        '航向': cfg.heading + '°',
        '俯仰': cfg.pitch + '°',
        '翻滚': cfg.roll + '°',
      });
      return cfg;
    },

    // 飞到模型位置
    flyTo() {
      flyToView(viewer, 'beilun');
    },
  };

  console.log('[Model] 调试工具已就绪，使用 debugModel 命令：');
  console.log('  debugModel.info()              - 查看当前配置');
  console.log('  debugModel.setHeading(85)      - 设置航向角');
  console.log('  debugModel.setScale(0.5)       - 设置缩放');
  console.log('  debugModel.setHeight(10)       - 设置高度(米)');
  console.log('  debugModel.moveEast(50)        - 向东移动50米');
  console.log('  debugModel.moveNorth(-30)      - 向南移动30米');
  console.log('  debugModel.setPosition(lng, lat) - 设置坐标');
  console.log('  debugModel.reset()             - 重置');
}

// ============================================================
// 15. DOM 就绪后启动
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
