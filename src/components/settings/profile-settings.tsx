"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Loader2, User } from "lucide-react"
import { toast } from "sonner"
import { useLiterals } from "@/hooks/use-literals"

export function ProfileSettings() {
  const lt = useLiterals()
  const [loading, setLoading] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [userId, setUserId] = useState<string | null>(null)

  const getProfile = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/profile')
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to load profile'))

      setUserId(json?.user?.id || null)
      setEmail(json?.user?.email || "")
      setFullName(json?.profile?.full_name || "")
    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }, [lt])

  useEffect(() => {
    getProfile()
  }, [getProfile])

  const updateProfile = async () => {
    try {
      setLoading(true)
      if (!userId) return

      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || lt('Failed to update profile'))
      
      toast.success(lt('Profile updated successfully.'))
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error(lt('Failed to update profile.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{lt('Profile Information')}</CardTitle>
        <CardDescription>
          {lt('Update your personal information and email address.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{lt('Email')}</Label>
          <Input id="email" value={email} disabled />
          <p className="text-xs text-muted-foreground">
            {lt('Your email address is managed through your login provider.')}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fullName">{lt('Full Name')}</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={lt('Enter your full name')}
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={updateProfile} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {lt('Save Changes')}
        </Button>
      </CardFooter>
    </Card>
  )
}
