import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { FirebaseService } from "@/services/firebase-service"
import { useToast } from "@/hooks/use-toast"
import type { User } from "@/types"

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    // Check for stored user data on mount
    const storedUser = localStorage.getItem("admin-user")
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser)
        setUser(userData)
      } catch (error) {
        localStorage.removeItem("admin-user")
      }
    }

    setLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      const userData = await FirebaseService.authenticateUser(email, password)

      if (userData) {
        setUser(userData)
        localStorage.setItem("admin-user", JSON.stringify(userData))

        toast({
          title: "Welcome back!",
          description: "Successfully logged in to admin panel",
        })
      } else {
        throw new Error("Invalid email or password")
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      })
      throw error
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("admin-user")
    toast({
      title: "Logged out",
      description: "Successfully logged out from admin panel",
    })
  }

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
