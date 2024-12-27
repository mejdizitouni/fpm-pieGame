import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function ProtectedRoute({ children }) {
  const navigate = useNavigate();
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/'); // Redirect to login page if no token
    }
  }, [navigate]);

  return children; // Render children if authenticated
}

export default ProtectedRoute;
