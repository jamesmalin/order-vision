import { generateContent } from "./model-garden/index.mjs";
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
    "Chamado Nº: Mensal Dez"
]`;

const response = await generateContent('gemini-1.5-pro-002', prompt, addressResponseSchema);
console.log(response);
