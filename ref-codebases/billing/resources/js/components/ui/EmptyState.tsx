import { Stack, Text, ThemeIcon } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';
import type { ReactNode } from 'react';

type Props = {
    title: string;
    description?: string;
    action?: ReactNode;
};

export default function EmptyState({ title, description, action }: Props) {
    return (
        <Stack align="center" justify="center" py="xl" gap="md">
            <ThemeIcon size={64} radius="md" variant="light" color="gray">
                <IconInbox size={32} stroke={1.25} />
            </ThemeIcon>
            <Text fw={600}>{title}</Text>
            {description ? (
                <Text c="dimmed" size="sm" ta="center" maw={420}>
                    {description}
                </Text>
            ) : null}
            {action}
        </Stack>
    );
}
