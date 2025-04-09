import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, School } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (role: 'teacher' | 'student') => {
    setIsLoading(true);
    try {
      login(role);
      navigate(role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-white/80 backdrop-blur-sm p-8 rounded-xl shadow-xl">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Welcome to EduPlatform
          </h2>
          <p className="mt-2 text-sm text-gray-600">Choose your role to continue</p>
        </div>
        <div className="mt-8 space-y-4">
          <Button
            className="w-full h-14 text-lg"
            onClick={() => handleLogin('teacher')}
            disabled={isLoading}
          >
            <School className="mr-2 h-5 w-5" />
            Continue as Teacher
          </Button>
          <Button
            className="w-full h-14 text-lg"
            variant="outline"
            onClick={() => handleLogin('student')}
            disabled={isLoading}
          >
            <GraduationCap className="mr-2 h-5 w-5" />
            Continue as Student
          </Button>
        </div>
      </div>
    </div>
  );
}
