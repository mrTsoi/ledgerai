import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil1Icon, TrashIcon } from '@radix-ui/react-icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

// Placeholder types and API calls
// Replace with real types and API integration
interface ScheduledJob {
  id: string;
  source: string;
  frequency: string;
  lastRun: string;
  nextRun: string;
  status: 'success' | 'failure' | 'pending';
}

const FREQUENCIES = [
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily', value: '0 0 * * *' },
  { label: 'Weekly', value: '0 0 * * 0' },
  { label: 'Custom (cron)', value: 'custom' },
];

export function AutomatedSyncSettings() {
    const [helpOpen, setHelpOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [rotating, setRotating] = useState(false);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [editFrequency, setEditFrequency] = useState('');
  const [editCustom, setEditCustom] = useState('');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    // Fetch initial state: enabled, webhookUrl, jobs
    // Replace with real API calls
    setEnabled(true);
    setWebhookUrl(location.origin+'/api/external-sources/run?tenant_id=TENANT_ID&secret=SECRET');
    setJobs([
      {
        id: '1',
        source: 'Google Drive',
        frequency: 'Every 6 hours',
        lastRun: '2025-12-14 08:00',
        nextRun: '2025-12-14 14:00',
        status: 'success',
      },
    ]);
    setLoading(false);
  }, []);

  const handleRotateSecret = async () => {
    setRotating(true);
    // Call API to rotate secret and update webhookUrl
    setTimeout(() => {
      setWebhookUrl('https://your-app.com/api/external-sources/run?tenant_id=TENANT_ID&secret=NEW_SECRET');
      toast.success('Secret rotated. Update your scheduler with the new URL.');
      setRotating(false);
    }, 1000);
  };

  const handleRunNow = async () => {
    setRunning(true);
    // Call API to trigger sync
    setTimeout(() => {
      toast.success('Sync triggered.');
      setRunning(false);
    }, 1000);
  };

  const handleEditJob = (job: ScheduledJob) => {
    setEditingJob(job);
    setEditFrequency(FREQUENCIES.find(f => f.value === job.frequency) ? job.frequency : 'custom');
    setEditCustom(FREQUENCIES.find(f => f.value === job.frequency) ? '' : job.frequency);
    setEditError('');
  };

  const handleSaveEdit = () => {
    let freq = editFrequency === 'custom' ? editCustom.trim() : editFrequency;
    if (!freq) {
      setEditError('Frequency is required.');
      return;
    }
    // TODO: Add cron validation here if needed
    setJobs(jobs => jobs.map(j => j.id === editingJob?.id ? { ...j, frequency: freq } : j));
    setEditingJob(null);
    setEditFrequency('');
    setEditCustom('');
    setEditError('');
    toast.success('Schedule updated.');
  };

  const handleDeleteJob = (id: string) => {
    setJobs(jobs => jobs.filter(j => j.id !== id));
    toast.success('Schedule deleted.');
  };

  const handleAddJob = () => {
    setEditingJob({
      id: 'new-' + Date.now(),
      source: '',
      frequency: '0 * * * *',
      lastRun: '-',
      nextRun: '-',
      status: 'pending',
    });
    setEditFrequency('0 * * * *');
    setEditCustom('');
    setEditError('');
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Automated Data Sync</CardTitle>
        <CardDescription>
          Automate your data imports by connecting a scheduler. No coding required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-sm">Enable Automated Sync</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleRunNow} disabled={running || !enabled}>
            {running ? 'Running...' : 'Run Now'}
          </Button>
        </div>
        <div className="space-y-2">
          <div className="font-medium text-sm">Webhook URL</div>
          <Input
            className="font-mono text-xs"
            value={webhookUrl}
            readOnly
            onFocus={e => e.target.select()}
          />
          <div className="text-xs text-muted-foreground">
            Copy this URL into your scheduler to enable automated sync. <br />
            <span className="text-warning">Keep this URL secret.</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleRotateSecret} disabled={rotating}>
            {rotating ? 'Rotating...' : 'Rotate Secret'}
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium text-sm">Scheduled Jobs</div>
            <Button size="sm" variant="outline" onClick={handleAddJob}>Add Schedule</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border rounded-md">
              <thead>
                <tr>
                  <th className="p-2 text-left">Source</th>
                  <th className="p-2 text-left">Frequency</th>
                  <th className="p-2 text-left">Last Run</th>
                  <th className="p-2 text-left">Next Run</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} className="border-t">
                    <td className="p-2">{job.source || <span className="italic text-muted-foreground">(not set)</span>}</td>
                    <td className="p-2">{FREQUENCIES.find(f => f.value === job.frequency)?.label || job.frequency}</td>
                    <td className="p-2">{job.lastRun}</td>
                    <td className="p-2">{job.nextRun}</td>
                    <td className="p-2">
                      <span className={
                        job.status === 'success'
                          ? 'text-green-600'
                          : job.status === 'failure'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                      }>
                        {job.status}
                      </span>
                    </td>
                    <td className="p-2 flex gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-primary"
                              onClick={() => handleEditJob(job)}
                              aria-label="Edit schedule"
                            >
                              <Pencil1Icon className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDeleteJob(job.id)}
                              aria-label="Delete schedule"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit/Add Schedule Modal */}
        <Dialog open={!!editingJob} onOpenChange={open => { if (!open) setEditingJob(null); }}>
          <DialogContent className="max-w-md w-full">
            <DialogHeader>
              <DialogTitle>{editingJob?.id?.startsWith('new-') ? 'Add Schedule' : 'Edit Schedule'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Source</label>
                <Input
                  value={editingJob?.source || ''}
                  onChange={e => setEditingJob(j => j ? { ...j, source: e.target.value } : j)}
                  placeholder="e.g. Google Drive"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Frequency</label>
                <Select value={editFrequency} onValueChange={v => setEditFrequency(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editFrequency === 'custom' && (
                  <Input
                    className="mt-2"
                    value={editCustom}
                    onChange={e => setEditCustom(e.target.value)}
                    placeholder="Custom cron expression"
                  />
                )}
              </div>
              {editError && <div className="text-xs text-red-600">{editError}</div>}
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setEditingJob(null)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveEdit}>Save</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <div className="text-xs text-muted-foreground">
          <button
            type="button"
            className="underline text-left text-xs text-muted-foreground hover:text-primary focus:outline-none"
            onClick={() => setHelpOpen(true)}
          >
            How does automated sync work?
          </button>
        </div>

        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent className="max-w-md w-full">
            <DialogHeader>
              <DialogTitle>How does automated sync work?</DialogTitle>
              <DialogDescription>
                Learn how to set up and manage automated data sync for your tenant.
              </DialogDescription>
            </DialogHeader>
            <ul className="list-disc pl-5 space-y-2 text-sm mt-2">
              <li>
                <b>Automated sync</b> lets you schedule regular imports from your connected sources (e.g., Google Drive, SFTP) without manual action.
              </li>
              <li>
                <b>Setup:</b> Copy the provided Webhook URL into your preferred scheduler (such as Supabase Edge Functions, Zapier, or a cron service). The URL is unique to your tenant and securely triggers your data import.
              </li>
              <li>
                <b>Security:</b> Keep your Webhook URL secret. If you think it’s been exposed, use “Rotate Secret” to generate a new one and update your scheduler.
              </li>
              <li>
                <b>Status:</b> You can see the last and next run times, and the result of each scheduled import in the table above.
              </li>
              <li>
                <b>Troubleshooting:</b> If a sync fails, check your source connection and try “Run Now” to test. Contact support if issues persist.
              </li>
            </ul>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
