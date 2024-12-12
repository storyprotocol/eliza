import {
  Character,
  ModelProviderName,
  defaultCharacter,
  Clients,
} from "@ai16z/eliza";

export const mainCharacter: Character = {
  ...defaultCharacter,
  clients: [],
  modelProvider: ModelProviderName.ANTHROPIC,
  name: "Main Character",
};
