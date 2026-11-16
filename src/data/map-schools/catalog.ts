import basra from "./basra.json";
import nineveh from "./nineveh.json";
import additionalGovernorates from "./additional-governorates.json";

type MapSchoolSite = { id: string; name: string | null; lat: number; lng: number };
export type MapSchoolDataset = Record<string, MapSchoolSite[]>;

export const mapSchoolDatasets: Record<string, MapSchoolDataset> = {
  البصرة: basra,
  نينوى: nineveh,
  ...additionalGovernorates,
};
