'use client';

import { ChevronDown, Check } from 'lucide-react';
import { Select } from 'radix-ui';
import themeStyles from '../../styles/dashboard-theme.module.css';
import styles from './select-control.module.css';

export default function SelectControl({
  items,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  name,
  required,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) {
  return (
    <Select.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      name={name}
      required={required}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={[styles.trigger, className].filter(Boolean).join(' ')}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon className={styles.icon}>
          <ChevronDown aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className={`${styles.content} ${themeStyles.theme}`}
        >
          <Select.Viewport className={styles.viewport}>
            {items.map((item) => (
              <Select.Item
                key={item.value}
                value={item.value}
                disabled={item.disabled}
                className={styles.item}
              >
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator className={styles.indicator}>
                  <Check aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
