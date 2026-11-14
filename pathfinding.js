// Previous routing implementation moved to findRoute.js and retained here as comments.
// import { computeSlopeGrid } from "./slope.js";
// import { computeRouteMetrics } from "./routeMetrics.js";
// 
// const MAX_SLOPE = 15;
// const SLOPE_THRESHOLD_EPSILON = 1e-12;
// const DIRECTIONS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
// 
// /** Weights generate route alternatives; all profiles block >25 degree terrain. */
// export const ROUTE_PROFILES = Object.freeze({
//   shortest: Object.freeze({ slopeWeight: 0 }),
//   balanced: Object.freeze({ slopeWeight: 2 }),
//   lowSlope: Object.freeze({ slopeWeight: 12 }),
// });
// 
// class MinHeap {
//   constructor(size, costs, heuristics, priorities) {
//     this.ids = new Int32Array(size);
//     this.positions = new Int32Array(size);
//     this.positions.fill(-1);
//     this.costs = costs;
//     this.heuristics = heuristics;
//     this.priorities = priorities;
//     this.length = 0;
//   }
// 
//   compare(a, b) {
//     return this.priorities[a] - this.priorities[b] ||
//       this.heuristics[a] - this.heuristics[b] ||
//       this.costs[a] - this.costs[b];
//   }
// 
//   pushOrDecrease(id) {
//     const previous = this.positions[id];
//     if (previous === -2) return;
//     let index;
//     if (previous === -1) {
//       index = this.length++;
//       this.ids[index] = id;
//       this.positions[id] = index;
//     } else {
//       index = previous;
//     }
// 
//     while (index > 0) {
//       const parent = (index - 1) >> 1;
//       const parentId = this.ids[parent];
//       if (this.compare(parentId, id) <= 0) break;
//       this.ids[index] = parentId;
//       this.positions[parentId] = index;
//       index = parent;
//     }
//     this.ids[index] = id;
//     this.positions[id] = index;
//   }
// 
//   pop() {
//     if (this.length === 0) return -1;
//     const root = this.ids[0];
//     this.positions[root] = -2;
//     this.length -= 1;
// 
//     if (this.length > 0) {
//       const last = this.ids[this.length];
//       let index = 0;
//       while (true) {
//         const left = index * 2 + 1;
//         const right = left + 1;
//         if (left >= this.length) break;
//         const child = right < this.length && this.compare(this.ids[right], this.ids[left]) < 0
//           ? right
//           : left;
//         const childId = this.ids[child];
//         if (this.compare(last, childId) <= 0) break;
//         this.ids[index] = childId;
//         this.positions[childId] = index;
//         index = child;
//       }
//       this.ids[index] = last;
//       this.positions[last] = index;
//     }
//     return root;
//   }
// }
// 
// const error = (code, message) => ({ error: { code, message } });
// 
// function validateGrid(grid, meta) {
//   if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length) return { error: error("INVALID_GRID", "The elevation grid is empty or invalid.") };
//   const height = grid.length, width = grid[0].length;
//   if (!grid.every((row) => Array.isArray(row) && row.length === width)) return { error: error("INVALID_GRID", "The elevation grid rows do not have a consistent width.") };
//   const dx = meta?.cell_size?.x, dy = meta?.cell_size?.y;
//   if (!Number.isFinite(dx) || dx <= 0 || !Number.isFinite(dy) || dy <= 0 ||
//       (meta.width != null && meta.width !== width) || (meta.height != null && meta.height !== height)) return { error: error("INVALID_METADATA", "Grid metadata is missing or does not match the elevation grid.") };
//   return { width, height };
// }
// 
// function validateCell(cell, label, width, height) {
//   if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col) ||
//       cell.row < 0 || cell.row >= height || cell.col < 0 || cell.col >= width) return error("OUTSIDE_GRID", label + " point is outside the elevation grid.");
//   return null;
// }
// 
// function validateRequest(grid, meta, start, end) {
//   const d = validateGrid(grid, meta);
//   if (d.error) return d.error;
//   const a = validateCell(start, "Start", d.width, d.height);
//   if (a) return a;
//   const b = validateCell(end, "Destination", d.width, d.height);
//   if (b) return b;
//   return d;
// }
// 
// 
// function buildBlockedMask(blockedCells, width, height) {
//   if (!Array.isArray(blockedCells)) return error("INVALID_BLOCKED_CELLS", "Blocked cells must be provided as a list.");
//   const blocked = new Uint8Array(width * height);
//   for (const cell of blockedCells) {
//     if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col) ||
//         cell.row < 0 || cell.row >= height || cell.col < 0 || cell.col >= width) {
//       return error("INVALID_BLOCKED_CELLS", "Every blocked cell must be inside the elevation grid.");
//     }
//     blocked[cell.row * width + cell.col] = 1;
//   }
//   return blocked;
// }
// 
// function findPath(grid, meta, slopes, start, end, profile, blockedMask) {
//   const height = grid.length, width = grid[0].length;
//   const sSlope = slopes[start.row][start.col], eSlope = slopes[end.row][end.col];
//   if (blockedMask[start.row * width + start.col] || !Number.isFinite(sSlope) || sSlope > MAX_SLOPE + SLOPE_THRESHOLD_EPSILON) return error("BLOCKED_START", "The start point is on a blocked or unmapped cell.");
//   if (blockedMask[end.row * width + end.col] || !Number.isFinite(eSlope) || eSlope > MAX_SLOPE + SLOPE_THRESHOLD_EPSILON) return error("BLOCKED_END", "The destination is on a blocked or unmapped cell.");
// 
//   const startId = start.row * width + start.col, endId = end.row * width + end.col, size = width * height;
//   const dx = meta.cell_size.x, dy = meta.cell_size.y;
//   const costs = new Float64Array(size); costs.fill(Infinity);
//   const heuristics = new Float64Array(size); heuristics.fill(Infinity);
//   const priorities = new Float64Array(size); priorities.fill(Infinity);
//   const parents = new Int32Array(size); parents.fill(-1);
//   const heuristic = (row, col) => Math.hypot((end.row - row) * dy, (end.col - col) * dx);
//   const open = new MinHeap(size, costs, heuristics, priorities);
//   costs[startId] = 0;
//   heuristics[startId] = heuristic(start.row, start.col);
//   priorities[startId] = heuristics[startId];
//   open.pushOrDecrease(startId);
// 
//   while (open.length > 0) {
//     const currentId = open.pop();
//     if (currentId === endId) {
//       const cells = [];
//       for (let id = endId; id !== -1; id = parents[id]) cells.push({ row: Math.floor(id / width), col: id % width });
//       cells.reverse();
//       return computeRouteMetrics(grid, meta, slopes, cells);
//     }
// 
//     const row = Math.floor(currentId / width), col = currentId % width, here = slopes[row][col];
//     for (const [dr, dc] of DIRECTIONS) {
//       const nr = row + dr, nc = col + dc;
//       if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
//       const slope = slopes[nr][nc];
//       if (!Number.isFinite(slope) || slope > MAX_SLOPE + SLOPE_THRESHOLD_EPSILON) continue;
//       const id = nr * width + nc;
//       if (blockedMask[id] || open.positions[id] === -2) continue;
//       const length = Math.hypot(dr * dy, dc * dx);
//       const ratio = ((here + slope) / 2) / MAX_SLOPE;
//       const candidate = costs[currentId] + length * (1 + profile.slopeWeight * ratio * ratio);
//       if (candidate >= costs[id]) continue;
//       costs[id] = candidate;
//       parents[id] = currentId;
//       heuristics[id] = heuristic(nr, nc);
//       priorities[id] = candidate + heuristics[id];
//       open.pushOrDecrease(id);
//     }
//   }
//   return error("NO_ROUTE", "No traversable route connects the selected points.");
// }
// 
// function getSlopes(grid, meta) {
//   try { return computeSlopeGrid(grid, meta); }
//   catch (e) { return error("INVALID_GRID", e instanceof Error ? e.message : "Unable to calculate terrain slopes."); }
// }
// 
// /** Find the default balanced route using the team's agreed function contract. */
// export function findRoute(grid, meta, startCell, endCell, blockedCells = []) {
//   return findRouteWithProfile(grid, meta, startCell, endCell, "balanced", blockedCells);
// }
// 
// /** Find one shortest, balanced, or low-slope route. */
// export function findRouteWithProfile(grid, meta, startCell, endCell, profileName = "balanced", blockedCells = []) {
//   const request = validateRequest(grid, meta, startCell, endCell);
//   if (request.error) return request;
//   const profile = ROUTE_PROFILES[profileName];
//   if (!profile) return error("INVALID_PROFILE", "Unknown route profile: " + String(profileName) + ".");
//   const blocked = buildBlockedMask(blockedCells, request.width, request.height);
//   if (blocked.error) return blocked;
//   const slopes = getSlopes(grid, meta);
//   if (slopes.error) return slopes;
//   return findPath(grid, meta, slopes, startCell, endCell, profile, blocked);
// }
// 
// /** Find all three route alternatives while calculating the slope grid once. */
// export function findRouteOptions(grid, meta, startCell, endCell, blockedCells = []) {
//   const request = validateRequest(grid, meta, startCell, endCell);
//   if (request.error) return request;
//   const blocked = buildBlockedMask(blockedCells, request.width, request.height);
//   if (blocked.error) return blocked;
//   const slopes = getSlopes(grid, meta);
//   if (slopes.error) return slopes;
//   return Object.entries(ROUTE_PROFILES).map(([routeProfile, profile]) => ({
//     routeProfile,
//     ...findPath(grid, meta, slopes, startCell, endCell, profile, blocked),
//   }));
// }
// 
// function permutations(items) {
//   if (items.length <= 1) return [items];
//   const results = [];
//   for (let i = 0; i < items.length; i += 1) {
//     const rest = items.slice(0, i).concat(items.slice(i + 1));
//     for (const tail of permutations(rest)) results.push([items[i], ...tail]);
//   }
//   return results;
// }
// 
// /** Find the shortest balanced tour through exactly three targets, trying all six orders. */
// export function findBestTargetOrder(grid, meta, startCell, targetCells, blockedCells = []) {
//   const request = validateGrid(grid, meta);
//   if (request.error) return request.error;
//   if (!Array.isArray(targetCells) || targetCells.length !== 3) {
//     return error("INVALID_TARGETS", "Exactly three target cells are required.");
//   }
//   const startError = validateCell(startCell, "Start", request.width, request.height);
//   if (startError) return startError;
//   for (const target of targetCells) {
//     const targetError = validateCell(target, "Target", request.width, request.height);
//     if (targetError) return targetError;
//   }
//   const uniqueTargets = new Set(targetCells.map((cell) => cell.row + ":" + cell.col));
//   if (uniqueTargets.size !== 3) return error("INVALID_TARGETS", "The three target cells must be different.");
// 
//   const blocked = buildBlockedMask(blockedCells, request.width, request.height);
//   if (blocked.error) return blocked;
//   const slopes = getSlopes(grid, meta);
//   if (slopes.error) return slopes;
// 
//   const profile = ROUTE_PROFILES.balanced;
//   const startSlope = slopes[startCell.row][startCell.col];
//   if (blocked[startCell.row * request.width + startCell.col] ||
//       !Number.isFinite(startSlope) || startSlope > MAX_SLOPE + SLOPE_THRESHOLD_EPSILON) {
//     return error("BLOCKED_START", "The start point is on a blocked or unmapped cell.");
//   }
//   for (const target of targetCells) {
//     const index = target.row * request.width + target.col;
//     if (blocked[index] || !Number.isFinite(slopes[target.row][target.col]) ||
//         slopes[target.row][target.col] > MAX_SLOPE + SLOPE_THRESHOLD_EPSILON) {
//       return error("BLOCKED_TARGET", "A target is on a blocked or unmapped cell.");
//     }
//   }
// 
//   let best = null;
//   for (const order of permutations(targetCells)) {
//     let current = startCell;
//     const combinedCells = [];
//     const legs = [];
//     let reachable = true;
//     for (const target of order) {
//       const leg = findPath(grid, meta, slopes, current, target, profile, blocked);
//       if (leg.error) {
//         reachable = false;
//         break;
//       }
//       if (combinedCells.length) combinedCells.push(...leg.cells.slice(1));
//       else combinedCells.push(...leg.cells);
//       legs.push(leg);
//       current = target;
//     }
//     if (!reachable) continue;
//     const route = computeRouteMetrics(grid, meta, slopes, combinedCells);
//     if (!best || route.distanceKm < best.distanceKm) {
//       best = { targetOrder: order, legs, ...route };
//     }
//   }
// 
//   return best || error("NO_ROUTE", "No traversable order reaches all three targets.");
// }
// 