import {
  Button,
  FileUpload,
  FormSection,
  SelectField,
  Textarea,
  Field,
} from '@racepilot/ui';
import {
  MESSAGE_ATTACHMENT_LIMITS,
  type MessageAttachmentRecord,
  type MessageTemplateRecord,
} from '@racepilot/contracts';
import { messagesApi } from './messagesApi.js';
import { useState } from 'react';

type Props = {
  eventId: string;
  templates: MessageTemplateRecord[];
  subject: string;
  text: string;
  onSubject: (value: string) => void;
  onText: (value: string) => void;
  attachments: MessageAttachmentRecord[];
  onAttachments: (value: MessageAttachmentRecord[]) => void;
};
export function MessageComposer({
  eventId,
  templates,
  subject,
  text,
  onSubject,
  onText,
  attachments,
  onAttachments,
}: Props) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    if (attachments.length >= MESSAGE_ATTACHMENT_LIMITS.maxCount) {
      setError(
        `Höchstens ${MESSAGE_ATTACHMENT_LIMITS.maxCount} PDFs sind erlaubt.`,
      );
      return;
    }
    if (
      !/^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.pdf$/i.test(file.name) ||
      file.type !== 'application/pdf'
    ) {
      setError('Bitte eine PDF-Datei mit einem einfachen Dateinamen wählen.');
      return;
    }
    if (file.size > MESSAGE_ATTACHMENT_LIMITS.maxBytes || file.size === 0) {
      setError('Die PDF darf höchstens 10 MB groß sein.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === 'string') resolve(result.split(',')[1] ?? '');
          else reject(new Error());
        };
        reader.onerror = () => reject(new Error());
        reader.readAsDataURL(file);
      });
      const uploaded = await messagesApi.upload(eventId, file.name, data);
      onAttachments([...attachments, uploaded]);
    } catch {
      setError(
        'Die PDF konnte nicht hochgeladen werden. Bitte Datei und Verbindung prüfen.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <FormSection
        title="Inhalt"
        description="Vorlage wählen und für diesen Versand anpassen."
      >
        <SelectField
          label="Vorlage"
          defaultValue=""
          onChange={(event) => {
            const template = templates.find(
              (item) => item.id === event.target.value,
            );
            if (template) {
              onSubject(template.subject);
              onText(template.textBody);
            }
          }}
        >
          <option value="">Eigener Text</option>
          {templates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <Field
          label="Betreff"
          value={subject}
          maxLength={998}
          onChange={(event) => onSubject(event.target.value)}
        />
        <Textarea
          label="Nachricht"
          value={text}
          maxLength={50000}
          rows={9}
          onChange={(event) => onText(event.target.value)}
        />
      </FormSection>
      <FormSection
        title="Anhänge"
        description={`PDF · höchstens ${MESSAGE_ATTACHMENT_LIMITS.maxCount} Dateien à 10 MB`}
      >
        <FileUpload
          label="PDF hinzufügen"
          accept="application/pdf,.pdf"
          disabled={
            busy || attachments.length >= MESSAGE_ATTACHMENT_LIMITS.maxCount
          }
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
        {busy && <p role="status">PDF wird hochgeladen…</p>}
        {error && (
          <p role="alert" className="nb-message-alert">
            {error}
          </p>
        )}
        {attachments.map((item) => (
          <div className="nb-message-actions" key={item.objectId}>
            <span>
              {item.filename} ({Math.ceil(item.size / 1024)} KB)
            </span>
            <Button
              variant="text"
              onClick={() =>
                onAttachments(
                  attachments.filter(
                    (entry) => entry.objectId !== item.objectId,
                  ),
                )
              }
            >
              Entfernen
            </Button>
          </div>
        ))}
      </FormSection>
    </>
  );
}
