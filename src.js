import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

export function createRenderer(canvas, requireHardware = false) {
  const renderer = new WebGLRenderer({canvas, failIfMajorPerformanceCaveat:requireHardware});
  if (requireHardware) {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const adapter = info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    if (!adapter || /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(adapter)) {
      renderer.dispose();
      renderer.forceContextLoss();
      throw Error('服务器 Chromium 未检测到硬件 WebGL2，请检查 GPU 驱动');
    }
  }
  const scene = new Scene();
  scene.background = new Color(0x11151c);
  const spark = new SparkRenderer({renderer});
  scene.add(spark);
  const camera = new PerspectiveCamera();
  let model, closed = false;
  return {
    async load(path, progress) {
      const mesh = new SplatMesh({
        url:'/model/' + path.split('/').map(encodeURIComponent).join('/'), onProgress:progress
      });
      try {
        await mesh.initialized;
        if (closed) throw Error('视窗已关闭');
        const box = mesh.getBoundingBox();
        model = mesh;
        scene.add(mesh);
        return {min:box.min.toArray(), max:box.max.toArray(), count:mesh.numSplats};
      } catch (error) { mesh.dispose(); throw error; }
    },
    draw(view) {
      if (!model || closed) return;
      if (renderer.getContext().isContextLost()) throw Error('WebGL 上下文已丢失，可关闭其他视窗后重试');
      if (canvas.width !== view.width || canvas.height !== view.height) renderer.setSize(view.width, view.height, false);
      camera.aspect = view.width / view.height;
      camera.position.fromArray(view.position);
      camera.quaternion.fromArray(view.quaternion);
      camera.fov = view.fov;
      camera.near = view.near;
      camera.far = view.far;
      camera.updateProjectionMatrix();
      model.rotation.x = view.flipped ? Math.PI : 0;
      renderer.render(scene, camera);
    },
    dispose() {
      closed = true;
      model?.dispose();
      spark.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}
