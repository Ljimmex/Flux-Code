import { useState } from 'react';
import { Download, XIcon, Settings } from './icons';
import { useProviderStore } from '../stores/providerStore';
import type { ProviderKind } from '../types/provider';
import { PROVIDER_DISPLAY_NAMES } from '../types/provider';

interface ToastProps {
  kind: ProviderKind;
  current: string;
  latest: string;
  onDismiss: () => void;
  onOpenSettings: () => void;
}

export default function ProviderUpdateToast({ kind, latest, onDismiss, onOpenSettings }: ToastProps) {
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<'success' | 'error' | null>(null);
  const { setAvailableUpdates } = useProviderStore();

  const displayName = PROVIDER_DISPLAY_NAMES[kind];

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const result = await window.electronAPI.provider.updateCli(kind);
      if (result.success) {
        setUpdateResult('success');
        await window.electronAPI.provider.probe(kind);
        // Re-check updates so the badge disappears when CLI is now up-to-date
        const updates = await window.electronAPI.provider.checkUpdates();
        setAvailableUpdates(updates);
        setTimeout(onDismiss, 3000);
      } else {
        setUpdateResult('error');
      }
    } catch {
      setUpdateResult('error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="provider-update-toast">
      <div className="provider-update-toast-main">
        <div className="provider-update-toast-icon">
          <Download size={16} />
        </div>
        <div className="provider-update-toast-body">
          <div className="provider-update-toast-title">
            Update Available: {displayName} v{latest}
          </div>
          <div className="provider-update-toast-desc">
            Install the update now or review provider settings.
          </div>
          <div className="provider-update-toast-actions">
            <button className="provider-update-toast-btn secondary" onClick={onOpenSettings}>
              <Settings size={12} />
              <span>Settings</span>
            </button>
            <button
              className="provider-update-toast-btn primary"
              onClick={handleUpdate}
              disabled={updating || updateResult === 'success'}
            >
              {updating ? (
                <span className="provider-update-toast-spinner" />
              ) : updateResult === 'success' ? (
                'Updated'
              ) : (
                'Update'
              )}
            </button>
          </div>
          {updateResult === 'error' && (
            <div className="provider-update-toast-error">
              Update failed. Try running the command manually.
            </div>
          )}
        </div>
        <button className="provider-update-toast-dismiss" onClick={onDismiss}>
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}
