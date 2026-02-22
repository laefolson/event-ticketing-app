'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  inviteTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
} from './actions';
import type { TeamMember, TeamRole } from '@/types/database';

interface TeamManagerProps {
  members: TeamMember[];
  currentUserId: string;
}

const emptyInviteForm = {
  name: '',
  email: '',
  role: 'helper' as TeamRole,
};

export function TeamManager({ members, currentUserId }: TeamManagerProps) {
  const router = useRouter();

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(emptyInviteForm);
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Edit role dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editRole, setEditRole] = useState<TeamRole>('helper');
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Remove dialog state
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // General error (outside dialogs)
  const [error, setError] = useState<string | null>(null);

  // Invite handlers
  function openInvite() {
    setInviteForm(emptyInviteForm);
    setInviteError(null);
    setInviteOpen(true);
  }

  async function handleInvite() {
    setInviteError(null);
    setInvitePending(true);

    try {
      const result = await inviteTeamMember(inviteForm);

      if (!result.success) {
        setInviteError(result.error ?? 'Something went wrong.');
        return;
      }

      setInviteOpen(false);
      router.refresh();
    } catch {
      setInviteError('Something went wrong. Please try again.');
    } finally {
      setInvitePending(false);
    }
  }

  // Edit role handlers
  function openEditRole(member: TeamMember) {
    setEditingMember(member);
    setEditRole(member.role);
    setEditError(null);
    setEditOpen(true);
  }

  async function handleEditRole() {
    if (!editingMember) return;

    setEditError(null);
    setEditPending(true);

    try {
      const result = await updateTeamMemberRole(editingMember.id, editRole);

      if (!result.success) {
        setEditError(result.error ?? 'Something went wrong.');
        return;
      }

      setEditOpen(false);
      router.refresh();
    } catch {
      setEditError('Something went wrong. Please try again.');
    } finally {
      setEditPending(false);
    }
  }

  // Remove handlers
  function openRemove(member: TeamMember) {
    setRemovingMember(member);
    setRemoveError(null);
    setRemoveOpen(true);
  }

  async function handleRemove() {
    if (!removingMember) return;

    setRemoveError(null);
    setRemovePending(true);

    try {
      const result = await removeTeamMember(removingMember.id);

      if (!result.success) {
        setRemoveError(result.error ?? 'Something went wrong.');
        return;
      }

      setRemoveOpen(false);
      router.refresh();
    } catch {
      setRemoveError('Something went wrong. Please try again.');
    } finally {
      setRemovePending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          Team Members{' '}
          <span className="text-muted-foreground font-normal">
            ({members.length})
          </span>
        </h2>
        <Button onClick={openInvite}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </div>

      {/* Error banner (outside dialogs) */}
      {error && !inviteOpen && !editOpen && !removeOpen && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {members.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No team members yet. Invite someone to get started.
            </p>
            <Button variant="outline" onClick={openInvite}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Members table */
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>MFA</TableHead>
                <TableHead>Invited</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isSelf = member.user_id === currentUserId;

                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.name}
                      {isSelf && (
                        <span className="text-muted-foreground ml-1">
                          (you)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          member.role === 'admin' ? 'default' : 'secondary'
                        }
                      >
                        {member.role === 'admin' ? 'Admin' : 'Helper'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={member.mfa_enabled ? 'default' : 'outline'}
                      >
                        {member.mfa_enabled ? 'Enabled' : 'Not set up'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(member.invited_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditRole(member)}
                          disabled={isSelf}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openRemove(member)}
                          disabled={isSelf}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an email invitation to join your team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {inviteError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                {inviteError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="invite-name">Name *</Label>
              <Input
                id="invite-name"
                value={inviteForm.name}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, name: e.target.value })
                }
                placeholder="Jane Smith"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-email">Email *</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, email: e.target.value })
                }
                placeholder="jane@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(val) =>
                  setInviteForm({
                    ...inviteForm,
                    role: val as TeamRole,
                  })
                }
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="helper">Helper</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={invitePending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={
                invitePending ||
                !inviteForm.name.trim() ||
                !inviteForm.email.trim()
              }
            >
              {invitePending ? 'Sending...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for {editingMember?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                {editError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editRole}
                onValueChange={(val) => setEditRole(val as TeamRole)}
              >
                <SelectTrigger id="edit-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="helper">Helper</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={editPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEditRole} disabled={editPending}>
              {editPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{' '}
              <span className="font-medium">{removingMember?.name}</span> from
              the team? This will also delete their account and cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {removeError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                {removeError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveOpen(false)}
              disabled={removePending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removePending}
            >
              {removePending ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
