// src/routes/AppRoutes.tsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import Login from '../pages/Login';
import ProtectedRoute from '../components/ProtectedRoute';

const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/register" element={<Register />} />
    <Route path="/login" element={<Login />} />
    <Route
      path="/dashboard"
      element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      }
    />
    {/* redirect unknown routes */}
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
);

export default AppRoutes;
