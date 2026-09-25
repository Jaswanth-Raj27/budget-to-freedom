import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Account settings — Debt Free Buddy" }] }),
  component: Settings,
});

function Settings() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const del = useServerFn(deleteMyAccount);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("name").maybeSingle()).data,
  });
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  useEffect(() => { if (profile) setName(profile.name); }, [profile]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Name updated");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }
  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { toast.error(error.message); return; }
    setPw("");
    toast.success("Password changed");
  }
  async function deleteAccount() {
    try {
      await del();
      qc.clear();
      await supabase.auth.signOut();
      toast.success("Your account has been deleted");
      navigate({ to: "/", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete account");
    }
  }

  const section = "rounded-2xl border bg-card p-6 shadow-sm";
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-primary">Account settings</h1>
      <form onSubmit={saveName} className={section}>
        <h2 className="font-semibold text-primary">Profile</h2>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <Button className="mt-4">Save name</Button>
      </form>
      <form onSubmit={savePw} className={section}>
        <h2 className="font-semibold text-primary">Change password</h2>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required />
        </div>
        <Button className="mt-4">Update password</Button>
      </form>
      <div className={`${section} border-destructive/30`}>
        <h2 className="font-semibold text-destructive">Delete account</h2>
        <p className="mt-1 text-sm text-muted-foreground">Permanently removes your account and every saved scenario.</p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-4">Delete my account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>This can't be undone. All your scenarios will be erased.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
