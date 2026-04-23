import * as xlsxModule from 'xlsx';

type XlsxModuleNamespace = typeof import('xlsx') & {
  default?: typeof import('xlsx');
};

export const XLSX = ((xlsxModule as XlsxModuleNamespace).default ?? xlsxModule) as typeof import('xlsx');