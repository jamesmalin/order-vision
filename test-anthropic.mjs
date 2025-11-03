import { callAnthropic } from "./anthropic.mjs";
import { z } from "zod";

const addressSchema = z.object({
    name: z.string().describe("Recipient's name."),
    address: z.string().describe("Full address."),
    address_english: z.string().describe("English version of the address."),
    address_reason: z.string().describe("Reason for using this address."),
    address_street: z.string().describe("Street name."),
    address_city: z.string().describe("City."),
    address_postal_code: z.string().describe("Postal code."),
    address_country_code: z.string().describe("Country code."),
});

const addressResponseSchema = z.object({
    sold_to: addressSchema,
    ship_to: addressSchema,
    consignee: addressSchema,
});

const prompt = ` **Paragraphs**: [
    "DB - MEDICINA DIAGNOSTICA LTDA - UP SOROCABA Código Empresa: 12 Endereço: RUA PROFESSOR RUY TELLES MIRANDA, 157 Bairro: RETIRO SÃO JOÃO CEP: 18085-760 UF: SP Cidade: SOROCABA",
    "DB DIAGNOSTICOS",
    "Telefone: (0015)32283-477",
    "CNPJ: 12.433.420/0012-01 I.E: 669702107115",
    "PEDIDO DE COMPRAS Nº: 1224002444",
    "DATA DO PEDIDC 27/11/2024",
    "Plano de Contas:",
    "2488 FORNECEDORES INSUMOS / REAGENTES",
    "Código: 11796",
    "Fornecedor: BIORAD LABORATORIO DO BRASIL LTDA",
    "CNPJ/CPF: 03.188.198/0005-09",
    "I.E / RG: 373114700112",
    "Cidade: ITAPEVI",
    "UF:SP",
    "CEP: 06696-060",
    "Telefone: (0021)3237 -9400",
    "Comprador: DEIVE JOSIANA PORTELA",
    "Chamado Nº: Mensal Dez",
    "ITEM",
    "CÓDIGO",
    "DESCRIÇÃO DOS PRODUTOS/SERVIÇOS",
    "REF. FORNECEDOR",
    "QUANTIDADE",
    "UM",
    "VL UNITÁRIO",
    "IPI",
    "VL TOTAL",
    "1",
    "05039",
    "CTL LIQUICHEK IMUNOENSAIOS ESPEC NIVEL1 (RMS:80020690279)",
    "364",
    "22",
    "CX\n:selected:",
    "1.579,58",
    "34.750,76",
    "2",
    "05040",
    "CTL LIQUICHEK IMUNOENSAIOS ESPEC NIVEL2 (RMS:80020690279)",
    "365",
    "19",
    "CX\n:selected:",
    "1.579,58",
    "30.012,02",
    "3",
    "05388",
    "CTL LIQUICHEK IMUNOENSAIOS ESPEC NIVEL3 (RMS:80020690279)",
    "366",
    "21",
    "CX\n:selected:",
    "2.308,62",
    "48.481,02",
    "4",
    "07651",
    "BETA TALASSEMIA (RMS:80020690245)",
    "2702154",
    "4",
    "KIT\n:selected:",
    "3.000,00",
    "12.000,00",
    "5",
    "08132",
    "CONTROLE LIPHOCHECK ENSAIADO (NÍVEL 1) (RMS: 80020690232)",
    "C-310-5",
    "6",
    "CX\n:selected:",
    "664,35",
    "3.986,10",
    "6",
    "08133",
    "CONTROLE LIPHOCHECK ENSAIADO (NÍVEL 2) (RMS:80020690232)",
    "C-315-5",
    "7",
    "CX\n:selected:",
    "560,55",
    "3.923,85",
    "7",
    "08137",
    "CONTROLE LIPHOCHECK DROGAS TER. (TRILEVEL) (RMS: 80020690218)",
    "450",
    "2",
    "CX\n:selected:",
    "1.917,17",
    "3.834,34",
    "8",
    "08148",
    "CONTROLE LIQUICHECK (NIVEL S2E)(RMS:80020690238)",
    "424",
    "1",
    "CX\n:selected:",
    "1.157,73",
    "1.157,73",
    "9",
    "08149",
    "CONTROLE LIPHOCHECK DIABETES (DOIS NÍVEIS)(RMS:80020690242)",
    "740",
    "3",
    "CX\n:selected:",
    "693,08",
    "2.079,24",
    "10",
    "08152",
    "CTL LYPHOCHECK IMMUNOASSAY NIVEL III (RMS: 80020690206)",
    "370",
    "149",
    "CX\n:selected:",
    "696,18",
    "103.730,82",
    "11",
    "08155",
    "CONTROLE LYPHOCHECK HEM A2 (BINÍVEL)(RMS:80020690230)",
    "553",
    "3",
    "CX\n:selected:",
    "2.222,32",
    "6.666,96",
    "12",
    "08852",
    "HIV I E II IMUNOBLOT 1/2 C/ 20T (RMS: 80020690327)",
    "72460",
    "75",
    "KIT",
    "1.130,00",
    "84.750,00",
    "13",
    "09476",
    "CONTROLE LYPHOCHECK ALERGENOS NEGATIVO (RMS: 80020690341)",
    "12000141",
    "1",
    "KIT",
    "775,22",
    "775,22",
    "14",
    "10485",
    "CTL LIQUICHEK MARCA CARDIACO PLUS TRINIVEL (RMS: 80020690185)",
    "180",
    "22",
    "CX",
    "376,21",
    "8.276,62",
    "15",
    "10549",
    "CTL LIQUICHEK QUIM URINARIO N1 (RMS: 80020690202)",
    "397",
    "1",
    "CX\n:selected:",
    "776,22",
    "776,22",
    "16",
    "10550",
    "CTL LIQUICHEK QUIM URINARIO N2 (RMS:80020690202)",
    "398",
    "1",
    "CX",
    "822,31",
    "822,31",
    "17",
    "10626",
    "CTL IMUNOLOGIA NIVEL I (RMS:80020690210)",
    "594",
    "6",
    "FR",
    "789,79000",
    "4.738,74",
    "18",
    "10627",
    "CTL IMUNOLOGIA NIVEL II (RMS: 80020690210)",
    "595",
    "6",
    "FR",
    "789,79000",
    "4.738,74",
    "19",
    "10628",
    "CTL IMUNOLOGIA NIVEL III (RMS:80020690210)",
    "596",
    "5",
    "FR",
    "820,46000",
    "4.102,30",
    "20",
    "12853",
    "RGT HBA1C CART & CAL PARCK D-100 10000T (RMS:80020690374)",
    "290-1004",
    "43",
    "KIT",
    "1.100,00",
    "47.300,00",
    "21",
    "12855",
    "ACS HBA1C PREFILTER SET D-100 10000T (RMS: ISENTO)",
    "290-1007",
    "47",
    "KIT",
    "1.549,64",
    "72.833,08",
    "22",
    "12856",
    "ACS SYSTEM CLEANING TUBE D-100 CX C/1,5 ML (RMS:80020690373)",
    "290-1008",
    "1",
    "KIT",
    "135,59",
    "135,59",
    "23",
    "12858",
    "RGT BUFFER A D-100- CX C/ 2600 ML 1283T (RMS: 80020690371)",
    "290-1010",
    "380",
    "KIT",
    "700,00",
    "266.000,00",
    "24",
    "12859",
    "RGT BUFFER B D-100 CX 1400 ML 4557T (RMS: 80020690372)",
    "290-1011",
    "109",
    "KIT",
    "700,00",
    "76.300,00",
    "25",
    "12860",
    "WASH SOLUTION D-100 - CX C/3300 ML (RMS: 80020690369)",
    "290-1012",
    "383",
    "KIT",
    "700,00",
    "268.100,00",
    "26",
    "27477",
    "ASPERGILLUS AG - PLATELIA (RMS: 80020690269)",
    "62794",
    "4",
    "KIT",
    "3.044,00",
    "12.176,00",
    "27",
    "22285",
    "CTL HIV 1/2 CONFIRMATORIO 240UL (RMS:80020690327)",
    "72329",
    "1",
    "FR",
    "370,00000",
    "370,00",
    "Impresso em: 27/11/2024 13:24:56 Página 1 de 2",
    "DB - MEDICINA DIAGNOSTICA LTDA - UP SOROCABA Código Empresa: 12",
    "DB DIAGNOSTICOS",
    "Endereço: RUA PROFESSOR RUY TELLES MIRANDA, 157 Bairro: RETIRO SÃO JOÃO CEP: 18085-760 UF: SP Cidade: SOROCABA",
    "Telefone: (0015)32283-477 CNPJ:12.433.420/0012-01 I.E: 669702107115",
    "PEDIDO DE COMPRAS Nº: 1224002444",
    "DATA DO PEDIDC 27/11/2024",
    "Plano de Contas:",
    "2488 FORNECEDORES INSUMOS / REAGENTES",
    "Código: 11796",
    "Fornecedor: BIORAD LABORATORIO DO BRASIL LTDA",
    "CNPJ/CPF: 03.188.198/0005-09",
    "I.E / RG: 373114700112",
    "Cidade: ITAPEVI",
    "UF: SP",
    "CEP: 06696-060",
    "Telefone: (0021)3237 -9400",
    "Comprador: DEIVE JOSIANA PORTELA",
    "Chamado Nº: Mensal Dez",
    "ITEM CÓDIGO",
    "DESCRIÇÃO DOS PRODUTOS/SERVIÇOS",
    "REF. FORNECEDOR",
    "QUANTIDADE",
    "UM",
    "VL UNITÁRIO",
    "IPI",
    "VL TOTAL",
    "FIM DA LISTA DE PRODUTOS",
    "Condição de pagamento:",
    "Data de Emissão:",
    "Frete:",
    "Valor Desconto Total: R$ 0",
    "TOTAL DOS PRODUTOS: R$ 1.102.817,66",
    "BOL: 90 DD",
    "27/11/2024",
    "% do Desconto Total: 0 %",
    "TOTAL COM IMPOSTOS: R$ 1.102.817,66",
    "RECEBIMENTO DE MATERIAIS:SEG. A SEX. 08:30 AS 11:30 / 13:30 AS 17:30",
    "Dados para Entrega",
    "IPI : > R$ 0,00",
    "ICMS:",
    "> R$ 0",
    "FRETE:",
    "R$",
    "Observação:",
    "DB",
    "Dias para entrega: 5 Previsão de entrega: 02/12/2024",
    "TOTAL GERAL:",
    "R$ 1.102.817,66",
    "DIAG",
    "OS",
    "Atenção:",
    "> Só serão aceitas notas fiscais que contenham o número do nosso pedido de compra.",
    "> O recebimento de Insumos e Produtos Químicos somente ocorrerá mediante apresentação de laudo técnico ou FISPQ junto a nota fiscal.",
    "> O prazo de validade mínimo aceito pelo grupo DB Diagnósticos é de 90 dias, para entrega de itens com validades inferiores é necessária aprovação antes do faturamento.",
    "> O DB não aceita boletos com outro beneficiário que não seja o emissor da nota fiscal.",
    "Impresso em: 27/11/2024 13:24:56 Pagina 2 de 2"
]

**Tables**: [
    "Table 1:\nITEM,CÓDIGO,DESCRIÇÃO DOS PRODUTOS/SERVIÇOS,REF. FORNECEDOR,QUANTIDADE,UM,VL UNITÁRIO,IPI,VL TOTAL\n1,05039,CTL LIQUICHEK IMUNOENSAIOS ESPEC NIVEL1 (RMS:80020690279),364,22,CX\n:selected:,1.579,58,,34.750,76\n2,05040,CTL LIQUICHEK IMUNOENSAIOS ESPEC NIVEL2 (RMS:80020690279),365,19,CX\n:selected:,1.579,58,,30.012,02\n3,05388,CTL LIQUICHEK IMUNOENSAIOS ESPEC NIVEL3 (RMS:80020690279),366,21,CX\n:selected:,2.308,62,,48.481,02\n4,07651,BETA TALASSEMIA (RMS:80020690245),2702154,4,KIT\n:selected:,3.000,00,,12.000,00\n5,08132,CONTROLE LIPHOCHECK ENSAIADO (NÍVEL 1) (RMS: 80020690232),C-310-5,6,CX\n:selected:,664,35,,3.986,10\n6,08133,CONTROLE LIPHOCHECK ENSAIADO (NÍVEL 2) (RMS:80020690232),C-315-5,7,CX\n:selected:,560,55,,3.923,85\n7,08137,CONTROLE LIPHOCHECK DROGAS TER. (TRILEVEL) (RMS: 80020690218),450,2,CX\n:selected:,1.917,17,,3.834,34\n8,08148,CONTROLE LIQUICHECK (NIVEL S2E)(RMS:80020690238),424,1,CX\n:selected:,1.157,73,,1.157,73\n9,08149,CONTROLE LIPHOCHECK DIABETES (DOIS NÍVEIS)(RMS:80020690242),740,3,CX\n:selected:,693,08,,2.079,24\n10,08152,CTL LYPHOCHECK IMMUNOASSAY NIVEL III (RMS: 80020690206),370,149,CX\n:selected:,696,18,,103.730,82\n11,08155,CONTROLE LYPHOCHECK HEM A2 (BINÍVEL)(RMS:80020690230),553,3,CX\n:selected:,2.222,32,,6.666,96\n12,08852,HIV I E II IMUNOBLOT 1/2 C/ 20T (RMS: 80020690327),72460,75,KIT,1.130,00,,84.750,00\n13,09476,CONTROLE LYPHOCHECK ALERGENOS NEGATIVO (RMS: 80020690341),12000141,1,KIT,775,22,,775,22\n14,10485,CTL LIQUICHEK MARCA CARDIACO PLUS TRINIVEL (RMS: 80020690185),180,22,CX,376,21,,8.276,62\n15,10549,CTL LIQUICHEK QUIM URINARIO N1 (RMS: 80020690202),397,1,CX\n:selected:,776,22,,776,22\n16,10550,CTL LIQUICHEK QUIM URINARIO N2 (RMS:80020690202),398,1,CX,822,31,,822,31\n17,10626,CTL IMUNOLOGIA NIVEL I (RMS:80020690210),594,6,FR,789,79000,,4.738,74\n18,10627,CTL IMUNOLOGIA NIVEL II (RMS: 80020690210),595,6,FR,789,79000,,4.738,74\n19,10628,CTL IMUNOLOGIA NIVEL III (RMS:80020690210),596,5,FR,820,46000,,4.102,30\n20,12853,RGT HBA1C CART & CAL PARCK D-100 10000T (RMS:80020690374),290-1004,43,KIT,1.100,00,,47.300,00\n21,12855,ACS HBA1C PREFILTER SET D-100 10000T (RMS: ISENTO),290-1007,47,KIT,1.549,64,,72.833,08\n22,12856,ACS SYSTEM CLEANING TUBE D-100 CX C/1,5 ML (RMS:80020690373),290-1008,1,KIT,135,59,,135,59\n23,12858,RGT BUFFER A D-100- CX C/ 2600 ML 1283T (RMS: 80020690371),290-1010,380,KIT,700,00,,266.000,00\n24,12859,RGT BUFFER B D-100 CX 1400 ML 4557T (RMS: 80020690372),290-1011,109,KIT,700,00,,76.300,00\n25,12860,WASH SOLUTION D-100 - CX C/3300 ML (RMS: 80020690369),290-1012,383,KIT,700,00,,268.100,00\n26,27477,ASPERGILLUS AG - PLATELIA (RMS: 80020690269),62794,4,KIT,3.044,00,,12.176,00\n27,22285,CTL HIV 1/2 CONFIRMATORIO 240UL (RMS:80020690327),72329,1,FR,370,00000,,370,00\n",
    "Table 2:\nCondição de pagamento:,Data de Emissão:,Frete:,Valor Desconto Total: R$ 0,TOTAL DOS PRODUTOS: R$ 1.102.817,66\nBOL: 90 DD,27/11/2024,,% do Desconto Total: 0 %,TOTAL COM IMPOSTOS: R$ 1.102.817,66\n"
]

Item Content: [
    {
        "index": 0,
        "content": [
            "34.750,76",
            "CTL LIQUICHEK IMUNOENSAIOS ESPEC NIVEL1 (RMS:80020690279)",
            "05039",
            "22",
            "CX",
            "1.579,58"
        ]
    },
    {
        "index": 1,
        "content": [
            "30.012,02",
            "CTL LIQUICHEK IMUNOENSAIOS ESPEC NIVEL2 (RMS:80020690279)",
            "05040",
            "19",
            "CX",
            "1.579,58"
        ]
    },
    {
        "index": 2,
        "content": [
            "48.481,02",
            "CTL LIQUICHEK IMUNOENSAIOS ESPEC NIVEL3 (RMS:80020690279)",
            "05388",
            "21",
            "CX",
            "2.308,62"
        ]
    },
    {
        "index": 3,
        "content": [
            "12.000,00",
            "BETA TALASSEMIA (RMS:80020690245)",
            "07651",
            "4",
            "KIT",
            "3.000,00"
        ]
    },
    {
        "index": 4,
        "content": [
            "3.986,10",
            "CONTROLE LIPHOCHECK ENSAIADO (NÍVEL 1) (RMS: 80020690232)",
            "08132",
            "6",
            "CX",
            "664,35"
        ]
    },
    {
        "index": 5,
        "content": [
            "3.923,85",
            "CONTROLE LIPHOCHECK ENSAIADO (NÍVEL 2) (RMS:80020690232)",
            "08133",
            "7",
            "CX",
            "560,55"
        ]
    },
    {
        "index": 6,
        "content": [
            "3.834,34",
            "CONTROLE LIPHOCHECK DROGAS TER. (TRILEVEL) (RMS: 80020690218)",
            "08137",
            "2",
            "CX",
            "1.917,17"
        ]
    },
    {
        "index": 7,
        "content": [
            "1.157,73",
            "CONTROLE LIQUICHECK (NIVEL S2E)(RMS:80020690238)",
            "08148",
            "1",
            "CX",
            "1.157,73"
        ]
    },
    {
        "index": 8,
        "content": [
            "2.079,24",
            "CONTROLE LIPHOCHECK DIABETES (DOIS NÍVEIS)(RMS:80020690242)",
            "08149",
            "3",
            "CX",
            "693,08"
        ]
    },
    {
        "index": 9,
        "content": [
            "103.730,82",
            "CTL LYPHOCHECK IMMUNOASSAY NIVEL III (RMS: 80020690206)",
            "08152",
            "149",
            "CX",
            "696,18"
        ]
    },
    {
        "index": 10,
        "content": [
            "6.666,96",
            "CONTROLE LYPHOCHECK HEM A2 (BINÍVEL)(RMS:80020690230)",
            "08155",
            "3",
            "CX",
            "2.222,32"
        ]
    },
    {
        "index": 11,
        "content": [
            "84.750,00",
            "HIV I E II IMUNOBLOT 1/2 C/ 20T (RMS: 80020690327)",
            "08852",
            "75",
            "KIT",
            "1.130,00"
        ]
    },
    {
        "index": 12,
        "content": [
            "775,22",
            "CONTROLE LYPHOCHECK ALERGENOS NEGATIVO (RMS: 80020690341)",
            "09476",
            "1",
            "KIT",
            "775,22"
        ]
    },
    {
        "index": 13,
        "content": [
            "8.276,62",
            "CTL LIQUICHEK MARCA CARDIACO PLUS TRINIVEL (RMS: 80020690185)",
            "10485",
            "22",
            "CX",
            "376,21"
        ]
    },
    {
        "index": 14,
        "content": [
            "776,22",
            "CTL LIQUICHEK QUIM URINARIO N1 (RMS: 80020690202)",
            "10549",
            "1",
            "CX",
            "776,22"
        ]
    },
    {
        "index": 15,
        "content": [
            "822,31",
            "CTL LIQUICHEK QUIM URINARIO N2 (RMS:80020690202)",
            "10550",
            "1",
            "CX",
            "822,31"
        ]
    },
    {
        "index": 16,
        "content": [
            "4.738,74",
            "CTL IMUNOLOGIA NIVEL I (RMS:80020690210)",
            "10626",
            "6",
            "FR",
            "789,79000"
        ]
    },
    {
        "index": 17,
        "content": [
            "4.738,74",
            "CTL IMUNOLOGIA NIVEL II (RMS: 80020690210)",
            "10627",
            "6",
            "FR",
            "789,79000"
        ]
    },
    {
        "index": 18,
        "content": [
            "4.102,30",
            "CTL IMUNOLOGIA NIVEL III (RMS:80020690210)",
            "10628",
            "5",
            "FR",
            "820,46000"
        ]
    },
    {
        "index": 19,
        "content": [
            "47.300,00",
            "RGT HBA1C CART & CAL PARCK D-100 10000T (RMS:80020690374)",
            "12853",
            "43",
            "KIT",
            "1.100,00"
        ]
    },
    {
        "index": 20,
        "content": [
            "72.833,08",
            "ACS HBA1C PREFILTER SET D-100 10000T (RMS: ISENTO)",
            "12855",
            "47",
            "KIT",
            "1.549,64"
        ]
    },
    {
        "index": 21,
        "content": [
            "135,59",
            "ACS SYSTEM CLEANING TUBE D-100 CX C/1,5 ML (RMS:80020690373)",
            "12856",
            "1",
            "KIT",
            "135,59"
        ]
    },
    {
        "index": 22,
        "content": [
            "266.000,00",
            "RGT BUFFER A D-100- CX C/ 2600 ML 1283T (RMS: 80020690371)",
            "12858",
            "380",
            "KIT",
            "700,00"
        ]
    },
    {
        "index": 23,
        "content": [
            "76.300,00",
            "RGT BUFFER B D-100 CX 1400 ML 4557T (RMS: 80020690372)",
            "12859",
            "109",
            "KIT",
            "700,00"
        ]
    },
    {
        "index": 24,
        "content": [
            "268.100,00",
            "WASH SOLUTION D-100 - CX C/3300 ML (RMS: 80020690369)",
            "12860",
            "383",
            "KIT",
            "700,00"
        ]
    },
    {
        "index": 25,
        "content": [
            "12.176,00",
            "ASPERGILLUS AG - PLATELIA (RMS: 80020690269)",
            "27477",
            "4",
            "KIT",
            "3.044,00"
        ]
    },
    {
        "index": 26,
        "content": [
            "370,00",
            "CTL HIV 1/2 CONFIRMATORIO 240UL (RMS:80020690327)",
            "22285",
            "1",
            "FR",
            "370,00000"
        ]
    },
    {
        "index": 27,
        "content": [
            "R$ 1.102.817,66"
        ]
    },
    {
        "index": 28,
        "content": [
            "27/11/2024"
        ]
    }
]`;
const response = await callAnthropic("claude-3.5-v2", addressResponseSchema, prompt);
console.log(response);