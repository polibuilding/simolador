// @ts-nocheck
// Cópia adaptada de @react-three/drei (GizmoHelper, licença MIT, (c) Poimandres).
// Diferença: com `perspective`, o cubo é desenhado com câmera em perspectiva (segue a vista da cena).
import * as React from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, Object3D, Matrix4, Quaternion } from 'three';
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Hud } from '@react-three/drei';

const Context = /* @__PURE__ */React.createContext({});
const useGizmoContext = () => {
  return React.useContext(Context);
};
const turnRate = 2 * Math.PI;
/** distância (px) da câmera em perspectiva até o cubo: menor = perspectiva mais forte */
const PERSP_D = 420;
const dummy = /* @__PURE__ */new Object3D();
const matrix = /* @__PURE__ */new Matrix4();
const [q1, q2] = [/* @__PURE__ */new Quaternion(), /* @__PURE__ */new Quaternion()];
const target = /* @__PURE__ */new Vector3();
const targetPosition = /* @__PURE__ */new Vector3();
const isOrbitControls = controls => {
  return 'minPolarAngle' in controls;
};
const isCameraControls = controls => {
  return 'getTarget' in controls;
};
const GizmoHelper = ({
  alignment = 'bottom-right',
  margin = [80, 80],
  renderPriority = 1,
  onUpdate,
  onTarget,
  perspective = false,
  children
}) => {
  const size = useThree(state => state.size);
  const mainCamera = useThree(state => state.camera);
  // @ts-ignore
  const defaultControls = useThree(state => state.controls);
  const invalidate = useThree(state => state.invalidate);
  const gizmoRef = React.useRef(null);
  const virtualCam = React.useRef(null);
  const animating = React.useRef(false);
  const radius = React.useRef(0);
  const focusPoint = React.useRef(new Vector3(0, 0, 0));
  const defaultUp = React.useRef(new Vector3(0, 0, 0));
  React.useEffect(() => {
    defaultUp.current.copy(mainCamera.up);
  }, [mainCamera]);
  const tweenCamera = React.useCallback(direction => {
    animating.current = true;
    if (defaultControls || onTarget) {
      focusPoint.current = (onTarget == null ? void 0 : onTarget()) || (isCameraControls(defaultControls) ? defaultControls.getTarget(focusPoint.current) : defaultControls == null ? void 0 : defaultControls.target);
    }
    radius.current = mainCamera.position.distanceTo(target);

    // Rotate from current camera orientation
    q1.copy(mainCamera.quaternion);

    // To new current camera orientation
    targetPosition.copy(direction).multiplyScalar(radius.current).add(target);
    dummy.lookAt(targetPosition);
    q2.copy(dummy.quaternion);
    invalidate();
  }, [defaultControls, mainCamera, onTarget, invalidate]);
  useFrame((_, delta) => {
    if (virtualCam.current && gizmoRef.current) {
      var _gizmoRef$current;
      // Animate step
      if (animating.current) {
        if (q1.angleTo(q2) < 0.01) {
          animating.current = false;
          // Orbit controls uses UP vector as the orbit axes,
          // so we need to reset it after the animation is done
          // moving it around for the controls to work correctly
          if (isOrbitControls(defaultControls)) {
            mainCamera.up.copy(defaultUp.current);
          }
        } else {
          const step = delta * turnRate;
          // animate position by doing a slerp and then scaling the position on the unit sphere
          q1.rotateTowards(q2, step);
          // animate orientation
          mainCamera.position.set(0, 0, 1).applyQuaternion(q1).multiplyScalar(radius.current).add(focusPoint.current);
          mainCamera.up.set(0, 1, 0).applyQuaternion(q1).normalize();
          mainCamera.quaternion.copy(q1);
          if (isCameraControls(defaultControls)) defaultControls.setPosition(mainCamera.position.x, mainCamera.position.y, mainCamera.position.z);
          if (onUpdate) onUpdate();else if (defaultControls) defaultControls.update(delta);
          invalidate();
        }
      }

      // perspectiva: o eixo da câmera passa pelo cubo, e a janela é deslocada para o cubo ficar no canto
      if (perspective && virtualCam.current.isPerspectiveCamera) {
        const W = size.width, H = size.height;
        const [mx, my] = margin;
        const gx = alignment.endsWith('-center') ? 0 : alignment.endsWith('-left') ? -W / 2 + mx : W / 2 - mx;
        const gy = alignment.startsWith('center-') ? 0 : alignment.startsWith('top-') ? H / 2 - my : -H / 2 + my;
        const xs = W / 2 + gx, ys = H / 2 - gy;
        virtualCam.current.setViewOffset(4 * W, 4 * H, 2 * W - xs, 2 * H - ys, W, H);
      }
      // Sync Gizmo with main camera orientation
      matrix.copy(mainCamera.matrix).invert();
      (_gizmoRef$current = gizmoRef.current) == null || _gizmoRef$current.quaternion.setFromRotationMatrix(matrix);
    }
  });
  const gizmoHelperContext = React.useMemo(() => ({
    tweenCamera
  }), [tweenCamera]);

  // Position gizmo component within scene
  const [marginX, marginY] = margin;
  const x = alignment.endsWith('-center') ? 0 : alignment.endsWith('-left') ? -size.width / 2 + marginX : size.width / 2 - marginX;
  const y = alignment.startsWith('center-') ? 0 : alignment.startsWith('top-') ? size.height / 2 - marginY : -size.height / 2 + marginY;
  return /*#__PURE__*/React.createElement(Hud, {
    renderPriority: renderPriority
  }, /*#__PURE__*/React.createElement(Context.Provider, {
    value: gizmoHelperContext
  }, perspective ? /*#__PURE__*/React.createElement(PerspectiveCamera, {
    key: 'p',
    makeDefault: true,
    ref: virtualCam,
    position: [x, y, PERSP_D],
    near: 1,
    far: PERSP_D * 10,
    fov: 2 * Math.atan((2 * size.height) / PERSP_D) * 180 / Math.PI
  }) : /*#__PURE__*/React.createElement(OrthographicCamera, {
    key: 'o',
    makeDefault: true,
    ref: virtualCam,
    position: [0, 0, 200]
  }), /*#__PURE__*/React.createElement("group", {
    ref: gizmoRef,
    position: [x, y, 0]
  }, children)));
};

export { GizmoHelper, useGizmoContext };
