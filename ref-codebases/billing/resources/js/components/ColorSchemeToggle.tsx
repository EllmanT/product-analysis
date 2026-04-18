import { ActionIcon, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

export default function ColorSchemeToggle() {
    const { setColorScheme } = useMantineColorScheme();
    const computed = useComputedColorScheme('light', {
        getInitialValueInEffect: true,
    });

    return (
        <ActionIcon
            onClick={() => setColorScheme(computed === 'light' ? 'dark' : 'light')}
            variant="subtle"
            color="gray"
            size="lg"
            aria-label="Toggle color scheme"
        >
            {computed === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
        </ActionIcon>
    );
}
