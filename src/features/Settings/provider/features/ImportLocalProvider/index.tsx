'use client';

import { Button, createModal } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';

import { ImportLocalProviderContent } from './Content';

export const ImportLocalProvider = () => {
  const { t } = useTranslation('modelProvider');
  const { allowed } = usePermission('manage_provider_key');
  return (
    <Button
      disabled={!allowed}
      onClick={() =>
        createModal({
          content: <ImportLocalProviderContent />,
          footer: null,
          title: t('localImport.title'),
          width: 'min(90vw, 640px)',
        })
      }
    >
      {t('localImport.title')}
    </Button>
  );
};
