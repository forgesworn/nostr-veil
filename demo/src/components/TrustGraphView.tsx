import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'

export interface GraphNode {
  pubkey: string
  endorsements: number
  ringEndorsements: number
}

export interface GraphEdge {
  from: string
  to: string
  anonymous: boolean
}

export interface RingEvent {
  members: string[]
  subject: string
}

export interface TrustGraphViewProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onNodeClick?: (pubkey: string) => void
  width?: number
  height?: number
  ringEvent?: RingEvent | null
  duressNode?: { pubkey: string; id: number } | null
}

/** Hexagonal polygon points for a given centre and radius */
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
  }
  return pts.join(' ')
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  endorsements: number
  ringEndorsements: number
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  anonymous: boolean
}

export function TrustGraphView({
  nodes,
  edges,
  onNodeClick,
  width = 900,
  height = 600,
  ringEvent,
  duressNode,
}: TrustGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simNodesRef = useRef<SimNode[]>([])
  const simLinksRef = useRef<SimLink[]>([])
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; pubkey: string } | null>(null)

  const handleNodeClick = useCallback(
    (pubkey: string) => onNodeClick?.(pubkey),
    [onNodeClick],
  )

  // Main D3 setup
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const root = d3.select(svg)
    root.selectAll('*').remove()

    // Defs for glow filter
    const defs = root.append('defs')

    // Amber glow filter for ring-endorsed nodes
    const glowFilter = defs.append('filter').attr('id', 'amber-glow')
    glowFilter
      .append('feGaussianBlur')
      .attr('stdDeviation', 4)
      .attr('result', 'blur')
    glowFilter
      .append('feFlood')
      .attr('flood-color', '#d97706')
      .attr('flood-opacity', 0.6)
      .attr('result', 'color')
    glowFilter
      .append('feComposite')
      .attr('in', 'color')
      .attr('in2', 'blur')
      .attr('operator', 'in')
      .attr('result', 'glow')
    const glowMerge = glowFilter.append('feMerge')
    glowMerge.append('feMergeNode').attr('in', 'glow')
    glowMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Teal glow filter for standard nodes
    const tealFilter = defs.append('filter').attr('id', 'teal-glow')
    tealFilter
      .append('feGaussianBlur')
      .attr('stdDeviation', 3)
      .attr('result', 'blur')
    tealFilter
      .append('feFlood')
      .attr('flood-color', '#0d9488')
      .attr('flood-opacity', 0.4)
      .attr('result', 'color')
    tealFilter
      .append('feComposite')
      .attr('in', 'color')
      .attr('in2', 'blur')
      .attr('operator', 'in')
      .attr('result', 'glow')
    const tealMerge = tealFilter.append('feMerge')
    tealMerge.append('feMergeNode').attr('in', 'glow')
    tealMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Build simulation data
    const simNodes: SimNode[] = nodes.map(n => ({
      id: n.pubkey,
      endorsements: n.endorsements,
      ringEndorsements: n.ringEndorsements,
    }))

    const nodeIds = new Set(simNodes.map(n => n.id))

    const simLinks: SimLink[] = edges
      .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map(e => ({
        source: e.from,
        target: e.to,
        anonymous: e.anonymous,
      }))

    // Store refs for animation access
    simNodesRef.current = simNodes
    simLinksRef.current = simLinks

    // Container group for zoom
    const g = root.append('g')
    gRef.current = g

    // Add zoom behaviour
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    root.call(zoom)

    // Draw edges
    const linkGroup = g.append('g').attr('class', 'links')
    const link = linkGroup
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', d => d.anonymous ? '#d97706' : '#2d5a5a')
      .attr('stroke-width', d => d.anonymous ? 2.5 : 1.5)
      .attr('stroke-opacity', d => d.anonymous ? 0.85 : 0.7)

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const node = nodeGroup
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', function(_event, d) {
        // Sonar ping feedback on click
        const clickLayer = gRef.current
        if (clickLayer) {
          const colour = d.ringEndorsements > 0 ? '#d97706' : d.endorsements > 0 ? '#0d9488' : '#7b68ee'
          clickLayer.append('circle')
            .attr('cx', d.x ?? 0).attr('cy', d.y ?? 0)
            .attr('r', 16).attr('fill', 'none')
            .attr('stroke', colour).attr('stroke-width', 2.5).attr('stroke-opacity', 1)
            .transition().duration(500).ease(d3.easeQuadOut)
            .attr('r', 50).attr('stroke-opacity', 0).remove()
          clickLayer.append('circle')
            .attr('cx', d.x ?? 0).attr('cy', d.y ?? 0)
            .attr('r', 16).attr('fill', colour).attr('fill-opacity', 0.15)
            .transition().duration(300)
            .attr('fill-opacity', 0).remove()
        }
        handleNodeClick(d.id)
      })
      .on('mouseenter', function(event, d) {
        d3.select(this).select('polygon').transition().duration(150).attr('fill', '#121828')
        const svgRect = svg.getBoundingClientRect()
        setTooltip({
          x: event.clientX - svgRect.left,
          y: event.clientY - svgRect.top - 44,
          pubkey: d.id,
        })
      })
      .on('mouseleave', function() {
        d3.select(this).select('polygon').transition().duration(200).attr('fill', '#0a0e14')
        setTooltip(null)
      })

    // Hexagons
    const hexRadius = 28

    node
      .append('polygon')
      .attr('class', 'hex-node')
      .attr('data-pubkey', d => d.id)
      .attr('points', hexPoints(0, 0, hexRadius))
      .attr('fill', '#0a0e14')
      .attr('stroke', d => {
        if (d.ringEndorsements > 0) return '#d97706'
        if (d.endorsements > 0) return '#0d9488'
        return '#4b5563'
      })
      .attr('stroke-width', d => d.ringEndorsements > 0 ? 2.5 : 2)
      .attr('filter', d => {
        if (d.ringEndorsements > 0) return 'url(#amber-glow)'
        if (d.endorsements > 0) return 'url(#teal-glow)'
        return 'none'
      })

    // Pubkey label inside hex (first 4 chars)
    node
      .append('text')
      .text(d => d.id.slice(0, 4))
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', d => {
        if (d.ringEndorsements > 0) return '#d97706'
        if (d.endorsements > 0) return '#0d9488'
        return '#6b7280'
      })
      .attr('font-size', 13)
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('font-weight', 600)

    // Animation overlay groups (rendered on top)
    g.append('g').attr('class', 'ring-arc-layer')
    g.append('g').attr('class', 'duress-layer')

    // Drag behaviour
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    node.call(drag)

    // Force simulation - higher alphaDecay so nodes settle quickly
    const simulation = d3
      .forceSimulation(simNodes)
      .alphaDecay(0.05)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id(d => d.id)
          .distance(130),
      )
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(50))
      .on('tick', () => {
        link
          .attr('x1', d => (d.source as SimNode).x ?? 0)
          .attr('y1', d => (d.source as SimNode).y ?? 0)
          .attr('x2', d => (d.target as SimNode).x ?? 0)
          .attr('y2', d => (d.target as SimNode).y ?? 0)

        node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

    simulationRef.current = simulation

    return () => {
      simulation.stop()
    }
    // Only recreate when nodes/edges change, NOT on resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, handleNodeClick])

  // Update SVG size and recenter on resize (without recreating the simulation)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    d3.select(svg).attr('width', width).attr('height', height)
    const sim = simulationRef.current
    if (sim) {
      sim.force('center', d3.forceCenter(width / 2, height / 2))
      sim.alpha(0.1).restart()
    }
  }, [width, height])

  // Ring arc animation
  useEffect(() => {
    if (!ringEvent || !gRef.current) return
    // Small delay for React render, then freeze simulation and animate
    const timer = setTimeout(() => {
      if (!gRef.current) return
      runRingArc(ringEvent)
    }, 200)
    return () => clearTimeout(timer)
  }, [ringEvent])

  function runRingArc(event: RingEvent) {
    const g = gRef.current!
    const layer = g.select<SVGGElement>('.ring-arc-layer')
    layer.selectAll('*').remove()

    // Freeze the simulation so nodes don't move during animation
    simulationRef.current?.stop()

    const simNodes = simNodesRef.current
    const nodeMap = new Map(simNodes.map(n => [n.id, n]))

    // Resolve positions — filter nodes that the simulation hasn't placed yet
    const memberPositions = event.members
      .map(m => nodeMap.get(m))
      .filter((n): n is SimNode => n != null && typeof n.x === 'number' && typeof n.y === 'number' && !isNaN(n.x))

    const subjectNode = nodeMap.get(event.subject)
    if (memberPositions.length < 2 || !subjectNode || typeof subjectNode.x !== 'number' || isNaN(subjectNode.x)) return

    // Build a curved path through the member nodes then to the subject
    const points: [number, number][] = memberPositions.map(n => [n.x!, n.y!])
    points.push([subjectNode.x!, subjectNode.y!])

    // Generate a smooth curve through the points
    const lineGen = d3.line<[number, number]>()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRom.alpha(0.5))

    const pathData = lineGen(points)
    if (!pathData) return

    // Draw the arc path with dash animation
    const arcPath = layer
      .append('path')
      .attr('d', pathData)
      .attr('fill', 'none')
      .attr('stroke', '#d97706')
      .attr('stroke-width', 2.5)
      .attr('stroke-opacity', 0.8)

    const totalLength = (arcPath.node() as SVGPathElement).getTotalLength()

    arcPath
      .attr('stroke-dasharray', totalLength)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(2500)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0)
      .on('end', () => {
        // After arc completes, keep it visible and add golden edge + pulse
        arcPath
          .transition()
          .duration(800)
          .attr('stroke-opacity', 0.5)
          .attr('stroke-width', 1.5)

        // Pulse the subject node amber
        for (let i = 0; i < 2; i++) {
          layer
            .append('circle')
            .attr('cx', subjectNode.x!)
            .attr('cy', subjectNode.y!)
            .attr('r', 22)
            .attr('fill', 'none')
            .attr('stroke', '#d97706')
            .attr('stroke-width', 2.5)
            .attr('stroke-opacity', 0.9)
            .transition()
            .delay(i * 600)
            .duration(1200)
            .attr('r', 50)
            .attr('stroke-opacity', 0)
            .remove()
        }

        // Amber fill stays on subject briefly
        layer
          .append('circle')
          .attr('cx', subjectNode.x!)
          .attr('cy', subjectNode.y!)
          .attr('r', 28)
          .attr('fill', 'rgba(217, 119, 6, 0.2)')
          .attr('stroke', 'none')
          .transition()
          .delay(2000)
          .duration(1500)
          .attr('fill', 'rgba(217, 119, 6, 0)')
          .remove()
      })

    // Clean up after a long hold — 10 seconds total
    setTimeout(() => {
      layer.selectAll('*')
        .transition()
        .duration(1000)
        .attr('stroke-opacity', 0)
        .attr('fill-opacity', 0)
        .remove()
    }, 10000)
  }

  // Duress ripple animation
  useEffect(() => {
    if (!duressNode || !gRef.current) return

    const timer = setTimeout(() => {
      if (!gRef.current) return
      runDuressRipple(duressNode.pubkey)
    }, 200)
    return () => clearTimeout(timer)
  }, [duressNode])

  function runDuressRipple(targetId: string) {
    const g = gRef.current!
    const layer = g.select<SVGGElement>('.duress-layer')
    layer.selectAll('*').remove()

    // Freeze the simulation so nodes don't move during animation
    simulationRef.current?.stop()

    const simNodes = simNodesRef.current
    const simLinks = simLinksRef.current
    const nodeMap = new Map(simNodes.map(n => [n.id, n]))

    const targetNode = nodeMap.get(targetId)
    if (!targetNode || typeof targetNode.x !== 'number' || isNaN(targetNode.x)) return

    const cx = targetNode.x!
    const cy = targetNode.y!

    // Concentric ripple circles (3 rings, staggered, slower)
    for (let i = 0; i < 3; i++) {
      layer
        .append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 25)
        .attr('fill', 'none')
        .attr('stroke', '#dc2626')
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.9)
        .transition()
        .delay(i * 700)
        .duration(3500)
        .ease(d3.easeQuadOut)
        .attr('r', 140 + i * 35)
        .attr('stroke-opacity', 0)
        .remove()
    }

    // Turn the compromised node border crimson
    g.select(`.hex-node[data-pubkey="${targetId}"]`)
      .transition()
      .duration(500)
      .attr('stroke', '#dc2626')
      .attr('stroke-width', 3)

    // Find adjacent nodes (connected via edges)
    const adjacentIds = new Set<string>()
    for (const link of simLinks) {
      const srcId = typeof link.source === 'object' ? (link.source as SimNode).id : link.source
      const tgtId = typeof link.target === 'object' ? (link.target as SimNode).id : link.target
      if (srcId === targetId) adjacentIds.add(tgtId as string)
      if (tgtId === targetId) adjacentIds.add(srcId as string)
    }

    // Dim adjacent nodes to 60% opacity
    g.selectAll<SVGGElement, SimNode>('.nodes g')
      .filter(d => adjacentIds.has(d.id))
      .transition()
      .duration(500)
      .attr('opacity', 0.4)

    // Transition edges from the compromised node to dashed
    g.selectAll<SVGLineElement, SimLink>('.links line')
      .filter(d => {
        const srcId = typeof d.source === 'object' ? (d.source as SimNode).id : d.source
        const tgtId = typeof d.target === 'object' ? (d.target as SimNode).id : d.target
        return srcId === targetId || tgtId === targetId
      })
      .transition()
      .duration(500)
      .attr('stroke', '#dc2626')
      .attr('stroke-dasharray', '6 4')
      .attr('stroke-opacity', 0.6)

    // Reset after animation
    setTimeout(() => {
      g.selectAll<SVGGElement, SimNode>('.nodes g')
        .transition()
        .duration(800)
        .attr('opacity', 1)

      g.selectAll<SVGLineElement, SimLink>('.links line')
        .filter(d => {
          const srcId = typeof d.source === 'object' ? (d.source as SimNode).id : d.source
          const tgtId = typeof d.target === 'object' ? (d.target as SimNode).id : d.target
          return srcId === targetId || tgtId === targetId
        })
        .transition()
        .duration(800)
        .attr('stroke', d => d.anonymous ? '#d97706' : '#2d5a5a')
        .attr('stroke-dasharray', null)
        .attr('stroke-opacity', d => d.anonymous ? 0.85 : 0.7)

      g.select(`.hex-node[data-pubkey="${targetId}"]`)
        .transition()
        .duration(800)
        .attr('stroke', () => {
          const n = nodeMap.get(targetId)
          if (n && n.ringEndorsements > 0) return '#d97706'
          if (n && n.endorsements > 0) return '#0d9488'
          return '#4b5563'
        })
        .attr('stroke-width', () => {
          const n = nodeMap.get(targetId)
          return n && n.ringEndorsements > 0 ? 2.5 : 2
        })

      layer.selectAll('*').remove()
    }, 10000)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          background: 'transparent',
          borderRadius: 4,
          display: 'block',
        }}
      />
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateX(-50%)',
            padding: '8px 14px',
            background: '#111827',
            border: '1px solid #374151',
            fontSize: '0.9rem',
            fontFamily: "'JetBrains Mono', monospace",
            color: '#e0e0e0',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          {tooltip.pubkey.slice(0, 8)}...{tooltip.pubkey.slice(-4)}
        </div>
      )}
    </div>
  )
}
