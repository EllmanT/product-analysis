import { Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

type Props = {
    title: string;
    subtitle?: ReactNode;
    actions?: ReactNode;
};

export default function SectionHeader({ title, subtitle, actions }: Props) {
    return (
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md" mb="lg">
            <Stack gap={6}>
                <Title order={3} size="h4" fw={700}>
                    {title}
                </Title>
                {subtitle ? (
                    <Text c="dimmed" size="sm" component="div">
                        {subtitle}
                    </Text>
                ) : null}
            </Stack>
            {actions ? <Group gap="sm">{actions}</Group> : null}
        </Group>
    );
}
