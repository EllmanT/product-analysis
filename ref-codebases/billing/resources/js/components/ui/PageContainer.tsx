import { Container, type ContainerProps } from '@mantine/core';
import type { ReactNode } from 'react';

type Props = ContainerProps & {
    children: ReactNode;
};

export default function PageContainer({ children, size = 'xl', ...rest }: Props) {
    return (
        <Container size={size} px={{ base: 'md', sm: 'lg' }} py="lg" {...rest}>
            {children}
        </Container>
    );
}
