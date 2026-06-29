import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requiredRoles = [] }) {
  const { user, loading, token } = useAuth();

  if (loading) {
    return <div className="text-center py-20">Loading...</div>;
  }

  if (!token || !user) {
    return <Navigate to="/" replace />;
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
    return (
      <div className="text-center py-20 text-red-500">
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p>You do not have the required role to view this page.</p>
      </div>
    );
  }

  return children;
}
