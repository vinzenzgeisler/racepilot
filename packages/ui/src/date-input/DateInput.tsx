import React from 'react';
import { TextInput, type TextInputProps } from '../text-input/TextInput.js';
export type DateInputProps = Omit<TextInputProps, 'type'>;
export function DateInput(props: DateInputProps) {
  return <TextInput {...props} type="date" />;
}
