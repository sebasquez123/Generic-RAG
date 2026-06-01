import { Role } from "~/shared/middleware/context/types/context.types";

export interface Bot {
    id: string;
    name: string;
    contractId: number | string;
    description: string;
    suspended: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Contract {
    id: number | string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
    role: Role;
    permissions: string[];
    scopes: string[];
}

export interface BotEntity {contract: Contract | undefined, bot: Bot | undefined}

export enum ContractId {
    CONTRACT_1 = 1,
    CONTRACT_2 = 2,
    CONTRACT_3 = 3
}


const contracts: Contract[] = [
    {
        id: ContractId.CONTRACT_1,
        description: 'lend services for scrapping the web for relevant data instrospection.',
        createdAt: new Date(),
        updatedAt: new Date(),
        role: Role.scrapper,
        permissions: [],
        scopes: []
    },
    {
        id: ContractId.CONTRACT_2,
        description: 'lend services for analyzing the data and providing insights.',
        createdAt: new Date(),
        updatedAt: new Date(),
        role: Role.analyst,
        permissions: [],
        scopes: []
    },
    {
        id: ContractId.CONTRACT_3,
        description: 'lend services for marketing the data and promoting products.',
        createdAt: new Date(),
        updatedAt: new Date(),
        role: Role.marketer,
        permissions: [],
        scopes: []
    }
];

const bots: Bot[] = [
    {
        id: 'scrapper1',
        name: 'Bot One',
        contractId: ContractId.CONTRACT_1,
        description: 'First bot',
        suspended: false,
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: 'analyst1',
        name: 'Bot Two',
        contractId: ContractId.CONTRACT_1,
        description: 'Second bot',
        suspended: false,
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: 'marketer1',
        name: 'Bot Three',
        contractId: ContractId.CONTRACT_2,
        description: 'Third bot',
        suspended: true,
        createdAt: new Date(),
        updatedAt: new Date()
    }
]


export const getBotInfoRepository = async (botId: string): Promise<{contract: Contract | undefined, bot: Bot | undefined}> => {
    try {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        const bot = bots.find((bot) => bot.id === botId);
        const contract = contracts.find((contract) => contract.id === bot?.contractId);

        return {contract, bot};
    } catch (error) {
        throw new Error('Error during authentication checkout');
    }
}

