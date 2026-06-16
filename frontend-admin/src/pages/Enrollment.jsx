import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, authHeaders } from '../api';
import MultiAngleCapture from '../components/MultiAngleCapture';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Icon from '../ui/Icon';
import PageHeader from '../ui/PageHeader';

function parseError(err) {
  const data = err?.response?.data;
  if (!data) return err.message || 'Unknown error';
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(', ');
  return JSON.stringify(data);
}

function ConflictModal({ empCode, conflictData, onCancel, onOverwrite, disabled }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-title">⚠️ Employee ID already exists</div>
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          `Employee ID <strong>{empCode}</strong> is currently assigned to:`
        </p>
        <ul className="modal-info">
          <li>Name: <strong>{conflictData.name}</strong></li>
          <li>Number of registered images: <strong>{conflictData.points_count}</strong></li>
        </ul>
        <p className="modal-body">
          Do you want to <strong>delete the old data</strong> and register new data?
        </p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={disabled}>Cancel</button>
          <button className="btn btn-danger"    onClick={onOverwrite} disabled={disabled}>Overwrite</button>
        </div>
      </div>
    </div>
  );
}

const Enrollment = () => {
  const [empCode, setEmpCode]                     = useState('');
  const [name, setName]                           = useState('');
  const [capturedImages, setCapturedImages]       = useState(null);
  const [capturedLandmarks, setCapturedLandmarks] = useState(null);
  const [captureKey, setCaptureKey]               = useState(0);
  const [submitting, setSubmitting]               = useState(false);
  const [errorMessage, setErrorMessage]           = useState(null);
  const [successMessage, setSuccessMessage]       = useState(null);
  const [conflictData, setConflictData]           = useState(null);

  const resetAll = () => {
    setEmpCode('');
    setName('');
    setCapturedImages(null);
    setCapturedLandmarks(null);
    setCaptureKey((k) => k + 1);
    setErrorMessage(null);
  };

  const handleSubmit = async (force = false) => {
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('person_id', empCode);
    formData.append('name', name);
    capturedImages.forEach((blob) => formData.append('images', blob, 'face.jpg'));
    if (capturedLandmarks) formData.append('landmarks', JSON.stringify(capturedLandmarks));
    if (force) formData.append('force', 'true');

    try {
      const doneEmpCode = empCode;
      const doneName    = name;
      const res = await api.post('/api/enroll/', formData, {
        headers: authHeaders(),
      });
      resetAll();
      setSuccessMessage(
        `✅ Successfully registered ${res.data.points_created} images for employee ${doneName} (ID ${doneEmpCode}).`
      );
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      if (err.response?.status === 409) {
        setConflictData(err.response.data.detail.existing);
      } else {
        setErrorMessage(`❌ ${parseError(err)}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = empCode.trim() && name.trim() && capturedImages && !submitting;

  return (
    <div className="page-sm">
      <PageHeader icon={UserPlus} title="New Employee Face Registration" />

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Input label="Employee ID" placeholder="Ex: NV001" value={empCode} onChange={(e) => setEmpCode(e.target.value)} disabled={submitting} />
        <Input label="Employee Name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />

        <MultiAngleCapture
          key={captureKey}
          onCapturesComplete={(imgs, lms) => { setCapturedImages(imgs); setCapturedLandmarks(lms); }}
          onReset={() => setCapturedImages(null)}
          disabled={submitting}
        />

        <Button
          variant={canSubmit ? 'primary' : 'secondary'}
          onClick={() => handleSubmit(false)}
          disabled={!canSubmit}
          style={{ padding: '12px 20px', fontSize: 15 }}
        >
          {submitting ? 'Processing...' : <><Icon name="Save" size={16} /> Saved</>}
        </Button>

        {errorMessage   && <div className="alert-error">{errorMessage}</div>}
        {successMessage && <div className="alert-success">{successMessage}</div>}
      </div>

      {conflictData && (
        <ConflictModal
          empCode={empCode}
          conflictData={conflictData}
          onCancel={() => setConflictData(null)}
          onOverwrite={async () => {
            setConflictData(null);
            await handleSubmit(true);
          }}
          disabled={submitting}
        />
      )}
    </div>
  );
};

export default Enrollment;
