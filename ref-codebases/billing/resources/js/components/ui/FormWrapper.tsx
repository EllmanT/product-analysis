import { Stack, type StackProps } from '@mantine/core';
import type { ReactNode } from 'react';

type Props = StackProps & {
    children: ReactNode;
};

export default function FormWrapper({ children, gap = 'md', ...rest }: Props) {
    return (
        <Stack gap={gap} {...rest}>
            {children}
        </Stack>
    );
}
