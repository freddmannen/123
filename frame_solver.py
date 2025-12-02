import numpy as np

class FrameSolver:
    def __init__(self):
        self.nodes = {} # id -> {x, y}
        self.elements = [] # {id, n1, n2, E, A, I}
        self.supports = {} # node_id -> {fix_x, fix_y, fix_m} (bools)
        self.loads = [] # {node: id, fx: val, fy: val, m: val}
        # For distributed loads on members, we would need more complex equivalent nodal force logic
        
    def add_node(self, id, x, y):
        self.nodes[int(id)] = {'x': float(x), 'y': float(y)}
        
    def add_element(self, id, n1, n2, E, A, I):
        self.elements.append({
            'id': int(id),
            'n1': int(n1),
            'n2': int(n2),
            'E': float(E),
            'A': float(A),
            'I': float(I)
        })
        
    def add_support(self, node_id, type):
        # Types: 'pin', 'roller_x' (rolls on X, fixed Y), 'roller_y' (rolls on Y, fixed X), 'fixed'
        nid = int(node_id)
        if type == 'pin':
            self.supports[nid] = {'u': True, 'v': True, 'theta': False}
        elif type == 'fixed':
            self.supports[nid] = {'u': True, 'v': True, 'theta': True}
        elif type == 'roller': # Assume standard roller on ground (fixed Y, free X, free theta)
            self.supports[nid] = {'u': False, 'v': True, 'theta': False}
            
    def add_load(self, node_id, fx, fy, m):
        self.loads.append({
            'node': int(node_id),
            'fx': float(fx),
            'fy': float(fy),
            'm': float(m)
        })

    def solve(self):
        # DOF mapping: Node i -> 3*i, 3*i+1, 3*i+2 (u, v, theta)
        # We need a mapping from User Node ID -> Matrix Index
        sorted_node_ids = sorted(self.nodes.keys())
        node_map = {nid: i for i, nid in enumerate(sorted_node_ids)}
        num_nodes = len(sorted_node_ids)
        num_dof = 3 * num_nodes
        
        K_global = np.zeros((num_dof, num_dof))
        F_global = np.zeros(num_dof)
        
        # Assemble Stiffness
        for elem in self.elements:
            n1_id = elem['n1']
            n2_id = elem['n2']
            
            idx1 = node_map[n1_id]
            idx2 = node_map[n2_id]
            
            x1, y1 = self.nodes[n1_id]['x'], self.nodes[n1_id]['y']
            x2, y2 = self.nodes[n2_id]['x'], self.nodes[n2_id]['y']
            
            L = np.sqrt((x2-x1)**2 + (y2-y1)**2)
            if L == 0: continue
            
            dx = x2 - x1
            dy = y2 - y1
            c = dx / L # cos
            s = dy / L # sin
            
            E = elem['E']
            A = elem['A']
            I = elem['I']
            
            # Local stiffness matrix k' (6x6)
            # u1, v1, th1, u2, v2, th2
            k_local = np.zeros((6, 6))
            
            # Axial terms (EA/L)
            k_local[0,0] = k_local[3,3] = E*A/L
            k_local[0,3] = k_local[3,0] = -E*A/L
            
            # Bending terms
            k1 = 12*E*I/L**3
            k2 = 6*E*I/L**2
            k3 = 4*E*I/L
            k4 = 2*E*I/L
            
            # v1, th1, v2, th2 correspond to indices 1, 2, 4, 5
            k_local[1,1] = k_local[4,4] = k1
            k_local[1,4] = k_local[4,1] = -k1
            
            k_local[1,2] = k_local[2,1] = k2
            k_local[1,5] = k_local[5,1] = k2
            
            k_local[4,2] = k_local[2,4] = -k2
            k_local[4,5] = k_local[5,4] = -k2
            
            k_local[2,2] = k_local[5,5] = k3
            k_local[2,5] = k_local[5,2] = k4
            
            # Rotation Matrix T (6x6)
            # [ c  s  0  0  0  0]
            # [-s  c  0  0  0  0]
            # [ 0  0  1  0  0  0]
            # ...
            T = np.zeros((6, 6))
            T[0,0] = T[1,1] = c
            T[0,1] = s
            T[1,0] = -s
            T[2,2] = 1
            T[3,3] = T[4,4] = c
            T[3,4] = s
            T[4,3] = -s
            T[5,5] = 1
            
            # Global Element Stiffness
            k_global_elem = T.T @ k_local @ T
            
            # Add to global K
            # DOF indices for n1 and n2
            # n1: 3*idx1, 3*idx1+1, 3*idx1+2
            # n2: 3*idx2, 3*idx2+1, 3*idx2+2
            dofs = [3*idx1, 3*idx1+1, 3*idx1+2, 3*idx2, 3*idx2+1, 3*idx2+2]
            
            for i in range(6):
                for j in range(6):
                    K_global[dofs[i], dofs[j]] += k_global_elem[i, j]

        # Apply Loads
        for load in self.loads:
            nid = load['node']
            if nid in node_map:
                idx = node_map[nid]
                F_global[3*idx] += load['fx']
                F_global[3*idx+1] += load['fy']
                F_global[3*idx+2] += load['m']

        # Apply Supports
        fixed_dofs = []
        for nid, constraints in self.supports.items():
            if nid in node_map:
                idx = node_map[nid]
                if constraints['u']: fixed_dofs.append(3*idx)
                if constraints['v']: fixed_dofs.append(3*idx+1)
                if constraints['theta']: fixed_dofs.append(3*idx+2)
        
        fixed_dofs = sorted(list(set(fixed_dofs)))
        free_dofs = [i for i in range(num_dof) if i not in fixed_dofs]
        
        # Solve
        K_ff = K_global[np.ix_(free_dofs, free_dofs)]
        F_f = F_global[free_dofs]
        
        try:
            d_f = np.linalg.solve(K_ff, F_f)
        except np.linalg.LinAlgError:
            raise ValueError("Structure is unstable.")
            
        d_global = np.zeros(num_dof)
        d_global[free_dofs] = d_f
        
        # Calculate Reactions
        R_global = K_global @ d_global - F_global
        
        # Format Results
        results = {
            'nodes': [],
            'elements': [],
            'reactions': []
        }
        
        # Nodal Displacements
        for nid, idx in node_map.items():
            results['nodes'].append({
                'id': nid,
                'x': self.nodes[nid]['x'],
                'y': self.nodes[nid]['y'],
                'u': d_global[3*idx],
                'v': d_global[3*idx+1],
                'theta': d_global[3*idx+2]
            })
            
            # Check reaction
            # If node has support, record reaction
            if nid in self.supports:
                results['reactions'].append({
                    'node': nid,
                    'Rx': R_global[3*idx],
                    'Ry': R_global[3*idx+1],
                    'Mz': R_global[3*idx+2]
                })
                
        # Element Forces (not strictly required for drawing deformed shape, but good for info)
        # We can just return the deformed node positions for visualization primarily
        
        return results

