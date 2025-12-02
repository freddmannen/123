import numpy as np

class BeamSolver:
    def __init__(self, length, E, I):
        self.L = float(length)
        self.E = float(E)
        self.I = float(I)
        self.supports = [] 
        self.loads = []
        self.dist_loads = [] # List of dicts: {'start': x, 'end': x, 'magnitude': F/m}

    def add_support(self, pos, type):
        self.supports.append({'pos': float(pos), 'type': type})
        
    def add_load(self, pos, magnitude):
        self.loads.append({'pos': float(pos), 'magnitude': float(magnitude)})

    def add_dist_load(self, start, end, magnitude):
        self.dist_loads.append({'start': float(start), 'end': float(end), 'magnitude': float(magnitude)})

    def solve(self):
        # 1. Discretize the beam
        nodes = set([0.0, self.L])
        for s in self.supports:
            nodes.add(s['pos'])
        for l in self.loads:
            nodes.add(l['pos'])
        for dl in self.dist_loads:
            nodes.add(dl['start'])
            nodes.add(dl['end'])
        
        sorted_nodes = sorted(list(nodes))
        node_map = {x: i for i, x in enumerate(sorted_nodes)}
        num_nodes = len(sorted_nodes)
        num_dof = 2 * num_nodes 
        
        # 2. Assemble Global Stiffness Matrix (K) and Force Vector (F)
        K = np.zeros((num_dof, num_dof))
        F = np.zeros(num_dof)
        
        elements = []
        
        for i in range(num_nodes - 1):
            x1 = sorted_nodes[i]
            x2 = sorted_nodes[i+1]
            le = x2 - x1
            
            # Element Stiffness Matrix
            k_e = (self.E * self.I / le**3) * np.array([
                [12, 6*le, -12, 6*le],
                [6*le, 4*le**2, -6*le, 2*le**2],
                [-12, -6*le, 12, -6*le],
                [6*le, 2*le**2, -6*le, 4*le**2]
            ])
            
            indices = [2*i, 2*i+1, 2*(i+1), 2*(i+1)+1]
            
            for r in range(4):
                for c in range(4):
                    K[indices[r], indices[c]] += k_e[r, c]
            
            elements.append({'x1': x1, 'x2': x2, 'indices': indices})
            
            # Check if any distributed load covers this element
            # Since we split nodes at start/end of DLs, a DL either covers an element fully or not at all
            for dl in self.dist_loads:
                # Check center of element to be safe against floating point equality issues
                mid = (x1 + x2) / 2
                if dl['start'] <= mid <= dl['end']:
                    w = dl['magnitude'] 
                    # Fixed End Forces for Uniform Load w (positive y direction)
                    # But usually input w is negative for gravity.
                    # Formulas below assume w is force per length.
                    # Vertical Reaction: w*L/2
                    # Moment Reaction: w*L^2/12 (CCW at left, CW at right)
                    
                    # Nodal Forces = - Fixed End Actions (The force applied TO the node from the external load)
                    # Actually, in FEM formulation: F_node = Integral(N^T * w dx).
                    # For uniform w:
                    # f1y = w*L/2
                    # m1 = w*L^2/12
                    # f2y = w*L/2
                    # m2 = -w*L^2/12
                    
                    f_equiv = np.array([
                        w * le / 2,
                        w * le**2 / 12,
                        w * le / 2,
                        -w * le**2 / 12
                    ])
                    
                    for r in range(4):
                        F[indices[r]] += f_equiv[r]

        # 3. Apply Point Loads
        for load in self.loads:
            n_idx = node_map[load['pos']]
            dof_idx = 2 * n_idx 
            F[dof_idx] += load['magnitude'] 

        # 4. Apply Boundary Conditions
        fixed_dofs = []
        for support in self.supports:
            n_idx = node_map[support['pos']]
            fixed_dofs.append(2 * n_idx)
            if support['type'] == 'fixed':
                fixed_dofs.append(2 * n_idx + 1)
                
        fixed_dofs = sorted(list(set(fixed_dofs)))
        free_dofs = [i for i in range(num_dof) if i not in fixed_dofs]
        
        # Solve
        K_ff = K[np.ix_(free_dofs, free_dofs)]
        F_f = F[free_dofs]
        
        try:
            d_f = np.linalg.solve(K_ff, F_f)
        except np.linalg.LinAlgError:
            # Handle unstable structures
            raise ValueError("Structure is unstable or mechanism.")

        d = np.zeros(num_dof)
        d[free_dofs] = d_f
        
        # Calculate Reactions: R = K * d - F_applied
        # Note: F_applied here includes the equivalent nodal loads from distributed loads
        R = np.dot(K, d) - F
        
        # Post-processing: Calculate V(x) and M(x) using Statics (Method of Sections)
        # This is more robust for arbitrary distributed loads than element shape functions
        
        # 1. Collect all external forces (Point Loads + Supports + Distributed Loads)
        # We will iterate along x and sum forces/moments.
        
        plot_x = np.linspace(0, self.L, 500) # High res for smooth curves
        plot_v = []
        plot_m = []
        plot_y = [] # Deflection still from shape functions? 
                    # Shape functions are exact at nodes but approximate inside for UDL unless we add the particular solution.
                    # However, calculating deflection from V/M integration is also complex.
                    # Given high discretization (elements are split at load changes), the shape function error is small.
                    # BUT, for V and M diagrams, shape functions give linear/constant results which look bad for UDL (parabolic M).
                    # So we use Statics for V and M, and Shape Functions for Deflection.
        
        # Pre-calculate reaction dictionary for easy lookup
        reaction_dict = {} # pos -> {'Fy': val, 'Mz': val}
        for s in self.supports:
            n_idx = node_map[s['pos']]
            reaction_dict[s['pos']] = {
                'Fy': R[2*n_idx],
                'Mz': R[2*n_idx+1]
            }

        for x in plot_x:
            # Calculate Shear (Sum of vertical forces to left) and Moment (Sum of moments to left)
            
            # 1. Reactions
            shear_val = 0
            moment_val = 0
            
            for pos, r in reaction_dict.items():
                if pos <= x + 1e-9:
                    shear_val += r['Fy']
                    # For internal moment M(x), we subtract the external reaction moment Mz.
                    # Why? M(x) = Ry*x - M1. (Where M1 is CCW reaction moment).
                    # Or generally M(x) = -Sum(Moments_Left_About_x).
                    # Sum includes +Mz (if CCW). So we subtract r['Mz'].
                    moment_val += r['Fy'] * (x - pos) - r['Mz']
            
            # 2. Point Loads
            for l in self.loads:
                if l['pos'] <= x + 1e-9:
                    shear_val += l['magnitude']
                    moment_val += l['magnitude'] * (x - l['pos'])
            
            # 3. Distributed Loads
            for dl in self.dist_loads:
                if dl['start'] < x:
                    # Overlap length
                    end_x = min(x, dl['end'])
                    length = end_x - dl['start']
                    if length > 0:
                        force = dl['magnitude'] * length
                        centroid = dl['start'] + length / 2
                        shear_val += force
                        moment_val += force * (x - centroid)
            
            plot_v.append(shear_val)
            plot_m.append(moment_val)
            
            # Deflection (Interpolate using shape functions)
            # Find which element x is in
            for elem in elements:
                if elem['x1'] <= x <= elem['x2']:
                    # Evaluate shape function
                    x1 = elem['x1']
                    x2 = elem['x2']
                    le = x2 - x1
                    xi = x - x1
                    
                    if le == 0: continue # Should not happen
                    
                    indices = elem['indices']
                    d_elem = d[indices]
                    
                    N1 = 1 - 3*(xi/le)**2 + 2*(xi/le)**3
                    N2 = xi * (1 - 2*(xi/le) + (xi/le)**2)
                    N3 = 3*(xi/le)**2 - 2*(xi/le)**3
                    N4 = xi * ((xi/le)**2 - (xi/le))
                    
                    y_val = (N1*d_elem[0] + N2*d_elem[1] + N3*d_elem[2] + N4*d_elem[3])
                    
                    # Add approximate particular solution for UDL deflection if needed?
                    # Standard FEM usually just uses the nodal values. 
                    # With sufficient elements, this is close.
                    # Our nodes are split at load start/ends, but if load covers a long span, 
                    # the mid-span deflection might be slightly off if we don't use the exact UDL shape function.
                    # But usually it's "exact at nodes".
                    # For small apps, this is usually acceptable.
                    
                    plot_y.append(y_val)
                    break
            else:
                 # Should verify if x=L is handled (it falls in last element usually due to <=)
                 if len(plot_y) < len(plot_v):
                     plot_y.append(0) # boundary case

        return {
            "x": plot_x.tolist(),
            "deflection": plot_y,
            "shear": plot_v,
            "moment": plot_m,
            "reactions": self._format_reactions(R, sorted_nodes, node_map)
        }

    def _format_reactions(self, R, sorted_nodes, node_map):
        reactions = []
        for s in self.supports:
            n_idx = node_map[s['pos']]
            fy = R[2 * n_idx]
            mz = R[2 * n_idx + 1]
            
            if abs(fy) < 1e-8: fy = 0
            if abs(mz) < 1e-8: mz = 0
            
            reactions.append({
                'pos': s['pos'],
                'type': s['type'],
                'Fy': fy,
                'Mz': mz
            })
        return reactions
