import numpy as np

class PillarSolver:
    def __init__(self, length, E, I, A, k_factor_type):
        self.L = float(length)
        self.E = float(E)
        self.I = float(I)
        self.A = float(A)
        
        # Determine K factor
        # Types: 'pin-pin', 'fixed-free', 'fixed-fixed', 'fixed-pin'
        self.K = 1.0
        if k_factor_type == 'fixed-free':
            self.K = 2.0
        elif k_factor_type == 'fixed-fixed':
            self.K = 0.5
        elif k_factor_type == 'fixed-pin':
            self.K = 0.7
            
    def solve(self):
        # Euler Critical Load
        # P_cr = (pi^2 * E * I) / (K * L)^2
        
        effective_length = self.K * self.L
        
        if effective_length == 0:
            raise ValueError("Effective length cannot be zero")
            
        P_cr = (np.pi**2 * self.E * self.I) / (effective_length**2)
        
        # Critical Stress
        sigma_cr = P_cr / self.A if self.A > 0 else 0
        
        # Radius of Gyration
        r = np.sqrt(self.I / self.A) if self.A > 0 else 0
        
        # Slenderness Ratio
        slenderness = effective_length / r if r > 0 else 0
        
        return {
            "P_cr": P_cr,
            "sigma_cr": sigma_cr,
            "slenderness": slenderness,
            "K": self.K,
            "L_eff": effective_length
        }

