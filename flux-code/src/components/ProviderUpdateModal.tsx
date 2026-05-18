import { useState } from 'react';
import { Download, Copy, Check, XIcon } from './icons';
import type { ProviderKind } from '../types/provider';
import { PROVIDER_DISPLAY_NAMES } from '../types/provider';

interface Props {
  kind: ProviderKind;
  current: string;
  latest: string;
  installCommand: string;
  onClose: () => void;
  onUpdate: () => Promise<{ success: boolean; error?: string }>;
}

export default function ProviderUpdateModal({ kind, current, latest, installCommand, onClose, onUpdate }: Props) {
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const displayName = PROVIDER_DISPLAY_NAMES[kind];

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const result = await onUpdate();
      setUpdateResult(result);
    } catch (err: any) {
      setUpdateResult({ success: false, error: err.message || 'Update failed' });
    } finally {
      setUpdating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="update-modal-overlay" onClick={onClose}>
      <div className="update-modal" onClick={(e) => e.stopPropagation()}>
        <button className="update-modal-close" onClick={onClose}>
          <XIcon size={16} />
        </button>

        <h3 className="update-modal-title">Update available</h3>
        <p className="update-modal-subtitle">
          {displayName} — {current} → {latest}
        </p>
        <p className="update-modal-desc">Install the update now or review provider settings.</p>

        <button
          className="update-modal-btn"
          onClick={handleUpdate}
          disabled={updating}
        >
          {updating ? (
            <span className="update-modal-spinner" />
          ) : (
            <Download size={16} />
          )}
          <span>{updating ? 'Updating…' : 'Update now'}</span>
        </button>

        {updateResult && (
          <div className={`update-modal-result ${updateResult.success ? 'success' : 'error'}`}>
            {updateResult.success
              ? 'Update completed successfully. The provider will be re-probed automatically.'
              : updateResult.error}
          </div>
        )}

        <div className="update-modal-divider">
          <span>OR, UPDATE MANUALLY USING</span>
        </div>

        <div className="update-modal-cmd">
          <code>{installCommand}</code>
          <button className="update-modal-copy" onClick={handleCopy} title="Copy command">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
