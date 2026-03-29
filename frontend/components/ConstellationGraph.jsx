// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  components/ConstellationGraph.jsx  ·  Mangesh
//
//  Standalone Three.js 3D knowledge graph component.
//  Extracted from constellation.jsx for reuse.
//  Requires Three.js loaded via CDN (window.THREE).
//
//  Props:
//    data         — { nodes, edges } from getConstellation()
//    onNodeClick  — callback(node)
//    height       — canvas height in px (default 400)
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'

const SUBJECT_COLORS = [
  '#6C63FF','#43E97B','#F7971E','#FF5050',
  '#00C9FF','#FFB300','#FF6EFF','#7AFFB2',
]

function subjectColor(subject, subjectList) {
  const idx = subjectList.indexOf(subject)
  return SUBJECT_COLORS[idx % SUBJECT_COLORS.length] || '#6C63FF'
}

export default function ConstellationGraph({ data, onNodeClick, height = 400 }) {
  const mountRef    = useRef(null)
  const frameRef    = useRef(null)
  const isDragging  = useRef(false)
  const lastMouse   = useRef({ x: 0, y: 0 })
  const cameraTheta = useRef(0.3)
  const cameraPhi   = useRef(0.5)
  const cameraR     = useRef(14)

  useEffect(() => {
    if (!mountRef.current || !data || typeof window === 'undefined') return
    const THREE = window.THREE
    if (!THREE) return

    const el = mountRef.current
    const W  = el.clientWidth
    const H  = el.clientHeight

    const scene    = new THREE.Scene()
    scene.background = new THREE.Color(0x080810)
    scene.fog        = new THREE.FogExp2(0x080810, 0.045)

    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100)
    function updateCamera() {
      camera.position.set(
        cameraR.current * Math.sin(cameraPhi.current) * Math.sin(cameraTheta.current),
        cameraR.current * Math.cos(cameraPhi.current),
        cameraR.current * Math.sin(cameraPhi.current) * Math.cos(cameraTheta.current),
      )
      camera.lookAt(0, 0, 0)
    }
    updateCamera()

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    el.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.15))
    const ptLight = new THREE.PointLight(0x6C63FF, 1.2, 30)
    ptLight.position.set(0, 5, 0)
    scene.add(ptLight)

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const sp = new Float32Array(1500)
    for (let i = 0; i < 1500; i++) sp[i] = (Math.random() - 0.5) * 80
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x334455, size: 0.08 })))

    const subjectList = [...new Set(data.nodes.map((n) => n.subject))]
    const nodeMeshes  = []
    const nodeDataMap = new Map()

    data.nodes.forEach((node) => {
      const color  = subjectColor(node.subject, subjectList)
      const isHub  = node.isHub || false
      const radius = isHub ? 0.28 + node.confidence * 0.12 : 0.10 + node.confidence * 0.12
      const geo    = new THREE.SphereGeometry(radius, isHub ? 16 : 10, isHub ? 16 : 10)
      const mat    = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color),
        emissiveIntensity: isHub ? 0.7 : 0.35 + node.confidence * 0.45,
        roughness: 0.3, metalness: 0.6,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(node.x, node.y, node.z)
      scene.add(mesh)
      nodeMeshes.push(mesh)
      nodeDataMap.set(mesh.uuid, node)
    })

    data.edges.forEach((edge) => {
      const f = data.nodes[edge.from]
      const t = data.nodes[edge.to]
      if (!f || !t) return
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(f.x, f.y, f.z),
        new THREE.Vector3(t.x, t.y, t.z),
      ])
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x223355, transparent: true, opacity: 0.2 + edge.strength * 0.25,
      })))
    })

    const raycaster = new THREE.Raycaster()
    const mouse     = new THREE.Vector2()

    function onPointerUp(e) {
      if (isDragging.current) return
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(nodeMeshes)
      if (hits.length > 0) {
        const node = nodeDataMap.get(hits[0].object.uuid)
        if (node) onNodeClick && onNodeClick(node)
      }
    }
    function onPointerDown(e) {
      isDragging.current = false
      lastMouse.current  = { x: e.clientX, y: e.clientY }
    }
    function onPointerMove(e) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true
      if (e.buttons !== 1) return
      cameraTheta.current -= dx * 0.008
      cameraPhi.current    = Math.max(0.15, Math.min(Math.PI - 0.15, cameraPhi.current + dy * 0.008))
      lastMouse.current    = { x: e.clientX, y: e.clientY }
      updateCamera()
    }
    function onWheel(e) {
      cameraR.current = Math.max(5, Math.min(28, cameraR.current + e.deltaY * 0.015))
      updateCamera()
    }
    function onResize() {
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }

    const canvas = renderer.domElement
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup',   onPointerUp)
    canvas.addEventListener('wheel',       onWheel, { passive: true })
    window.addEventListener('resize',      onResize)

    let t = 0
    function animate() {
      frameRef.current = requestAnimationFrame(animate)
      t += 0.008
      if (!isDragging.current) { cameraTheta.current += 0.0015; updateCamera() }
      nodeMeshes.forEach((mesh) => {
        const node = nodeDataMap.get(mesh.uuid)
        if (node?.isHub) mesh.scale.setScalar(1 + Math.sin(t + node.id * 0.8) * 0.06)
      })
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameRef.current)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup',   onPointerUp)
      canvas.removeEventListener('wheel',       onWheel)
      window.removeEventListener('resize',      onResize)
      renderer.dispose()
      if (el.contains(canvas)) el.removeChild(canvas)
    }
  }, [data])

  return <div ref={mountRef} style={{ width: '100%', height }} />
}
