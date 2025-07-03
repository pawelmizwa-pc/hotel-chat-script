export const createExcelMessage = (
  knowledgeBaseDescription: string,
  excelData: string
): string => {
  return `${knowledgeBaseDescription}\n${excelData}`;
};
