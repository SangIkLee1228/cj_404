'use client';

import { Ellipsis } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import themeStyles from '../../styles/dashboard-theme.module.css';
import styles from './action-menu.module.css';

export default function ActionMenu({
  items,
  onAction,
  className,
  'aria-label': ariaLabel,
  open,
  defaultOpen,
  onOpenChange,
  modal,
  dir,
}) {
  return (
    <DropdownMenu.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      modal={modal}
      dir={dir}
    >
      <DropdownMenu.Trigger
        aria-label={ariaLabel}
        className={[styles.trigger, className].filter(Boolean).join(' ')}
      >
        <Ellipsis aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={`${styles.content} ${themeStyles.theme}`}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.value}
              disabled={item.disabled}
              data-tone={item.tone}
              className={styles.item}
              onSelect={() => onAction?.(item.value)}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
