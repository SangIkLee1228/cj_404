'use client';

import { useState } from 'react';
import { ToggleGroup } from 'radix-ui';
import styles from './segmented-control.module.css';

export default function SegmentedControl({
  items,
  value,
  defaultValue,
  onValueChange,
  className,
  ...props
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  function handleValueChange(nextValue) {
    if (nextValue === '') {
      return;
    }
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  }

  return (
    <ToggleGroup.Root
      {...props}
      type="single"
      value={currentValue}
      onValueChange={handleValueChange}
      className={[styles.root, className].filter(Boolean).join(' ')}
    >
      {items.map((item) => (
        <ToggleGroup.Item
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          className={styles.item}
        >
          {item.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
