import {
  Checkbox,
  Field,
  FormSection,
  SelectField,
  TextInput,
  Textarea,
} from '@racepilot/ui';

type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
};

export function updatePath(
  root: unknown,
  path: string,
  value: unknown,
): unknown {
  const keys = path.split('.').filter(Boolean);
  if (keys.length === 0) return value;
  const current =
    root && typeof root === 'object' && !Array.isArray(root)
      ? (root as Record<string, unknown>)
      : {};
  const [key, ...rest] = keys;
  return {
    ...current,
    [key!]: rest.length
      ? updatePath(current[key!], rest.join('.'), value)
      : value,
  };
}

function humanize(value: string) {
  return value
    .replaceAll(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toLocaleUpperCase());
}

export function SchemaFields({
  schema: rawSchema,
  value,
  path,
  errors,
  onChange,
}: {
  schema: unknown;
  value: unknown;
  path: string;
  errors: Record<string, string>;
  onChange: (path: string, value: unknown) => void;
}) {
  const schema =
    rawSchema && typeof rawSchema === 'object' ? (rawSchema as JsonSchema) : {};
  const objectValue =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (schema.type === 'object' && schema.properties) {
    const title =
      schema.title ??
      (path ? humanize(path.split('.').at(-1)!) : 'Moduleinstellungen');
    return (
      <FormSection
        title={title}
        {...(schema.description ? { description: schema.description } : {})}
      >
        {Object.entries(schema.properties).map(([key, child]) => {
          const fieldPath = path ? path + '.' + key : key;
          return (
            <SchemaFields
              key={fieldPath}
              schema={child}
              value={objectValue[key]}
              path={fieldPath}
              errors={errors}
              onChange={onChange}
            />
          );
        })}
      </FormSection>
    );
  }
  const id = 'module-config-' + (path || 'root');
  const label =
    schema.title ?? humanize(path.split('.').at(-1) ?? 'Konfiguration');
  const error = errors[path];
  if (schema.enum)
    return (
      <div>
        <SelectField
          id={id}
          label={label}
          value={String(value ?? '')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? id + '-error' : undefined}
          onChange={(event) => onChange(path, event.target.value)}
        >
          <option value="">—</option>
          {schema.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {humanize(String(option))}
            </option>
          ))}
        </SelectField>
        {error && (
          <small id={id + '-error'} role="alert">
            {error}
          </small>
        )}
      </div>
    );
  if (schema.type === 'boolean')
    return (
      <div>
        <Checkbox
          label={label}
          aria-describedby={error ? id + '-error' : undefined}
          aria-invalid={error ? true : undefined}
          checked={Boolean(value)}
          onChange={(event) => onChange(path, event.target.checked)}
        />
        {error && (
          <small id={id + '-error'} role="alert">
            {error}
          </small>
        )}
      </div>
    );
  if (schema.type === 'string')
    return (
      <TextInput
        id={id}
        label={label}
        type="text"
        value={String(value ?? '')}
        {...(error ? { error } : {})}
        {...(schema.description ? { hint: schema.description } : {})}
        onChange={(event) => onChange(path, event.target.value)}
      />
    );
  if (schema.type === 'number' || schema.type === 'integer')
    return (
      <Field
        id={id}
        label={label}
        type="number"
        value={typeof value === 'number' ? value : ''}
        {...(error ? { error } : {})}
        {...(schema.minimum !== undefined ? { min: schema.minimum } : {})}
        {...(schema.maximum !== undefined ? { max: schema.maximum } : {})}
        step={schema.type === 'integer' ? 1 : 'any'}
        onChange={(event) =>
          onChange(
            path,
            event.target.value === '' ? undefined : Number(event.target.value),
          )
        }
      />
    );
  return (
    <Textarea
      id={id}
      label={label}
      {...(error ? { error } : {})}
      value={JSON.stringify(value ?? {}, null, 2)}
      onChange={(event) => {
        try {
          onChange(path, JSON.parse(event.target.value));
        } catch {
          /* Server-side validation remains authoritative. */
        }
      }}
    />
  );
}
