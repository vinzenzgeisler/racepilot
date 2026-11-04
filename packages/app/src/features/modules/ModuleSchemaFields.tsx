type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
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
    return (
      <div>
        {Object.entries(schema.properties).map(([key, child]) => {
          const fieldPath = path ? `${path}.${key}` : key;
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
      </div>
    );
  }
  const id = `module-config-${path || 'root'}`;
  const label = schema.title ?? path.split('.').at(-1) ?? 'Configuration';
  const error = errors[path];
  const errorNode = error ? (
    <span id={`${id}-error`} role="alert">
      {error}
    </span>
  ) : null;
  const common = {
    id,
    'aria-describedby': error ? `${id}-error` : undefined,
    'aria-invalid': error ? true : undefined,
  };
  if (schema.enum)
    return (
      <label>
        {label}
        <select
          {...common}
          value={String(value ?? '')}
          onChange={(e) => onChange(path, e.target.value)}
        >
          <option value="" />
          {schema.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
        {errorNode}
      </label>
    );
  if (schema.type === 'boolean')
    return (
      <label>
        {label}
        <input
          {...common}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(path, e.target.checked)}
        />
        {errorNode}
      </label>
    );
  if (schema.type === 'string')
    return (
      <label>
        {label}
        <input
          {...common}
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(path, e.target.value)}
        />
        {errorNode}
      </label>
    );
  if (schema.type === 'number' || schema.type === 'integer')
    return (
      <label>
        {label}
        <input
          {...common}
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) =>
            onChange(
              path,
              e.target.value === '' ? undefined : Number(e.target.value),
            )
          }
        />
        {errorNode}
      </label>
    );
  return (
    <label>
      {label}
      <textarea
        {...common}
        value={JSON.stringify(value ?? {}, null, 2)}
        onChange={(e) => {
          try {
            onChange(path, JSON.parse(e.target.value));
          } catch {
            /* Keep server-side validation authoritative. */
          }
        }}
      />
      {errorNode}
    </label>
  );
}
