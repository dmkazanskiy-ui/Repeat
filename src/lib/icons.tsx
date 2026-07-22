import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import DirectionsBikeIcon from "@mui/icons-material/DirectionsBike";
import PoolIcon from "@mui/icons-material/Pool";
import StairsIcon from "@mui/icons-material/Stairs";
import RowingIcon from "@mui/icons-material/Rowing";
import DownhillSkiingIcon from "@mui/icons-material/DownhillSkiing";
import HikingIcon from "@mui/icons-material/Hiking";
import NordicWalkingIcon from "@mui/icons-material/NordicWalking";
import DirectionsWalkIcon from "@mui/icons-material/DirectionsWalk";
import SnowboardingIcon from "@mui/icons-material/Snowboarding";
import SurfingIcon from "@mui/icons-material/Surfing";
import SkateboardingIcon from "@mui/icons-material/Skateboarding";
import SailingIcon from "@mui/icons-material/Sailing";
import ElectricBikeIcon from "@mui/icons-material/ElectricBike";
import SelfImprovementIcon from "@mui/icons-material/SelfImprovement";
import SportsGymnasticsIcon from "@mui/icons-material/SportsGymnastics";
import SportsMartialArtsIcon from "@mui/icons-material/SportsMartialArts";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import AccessibilityIcon from "@mui/icons-material/Accessibility";
import SpaIcon from "@mui/icons-material/Spa";
import WavesIcon from "@mui/icons-material/Waves";
import BoltIcon from "@mui/icons-material/Bolt";
import TimerIcon from "@mui/icons-material/Timer";

/** Набор иконок для видов тренировок; ключ хранится в данных. */
export const ICONS = {
  run: DirectionsRunIcon,
  bike: DirectionsBikeIcon,
  ebike: ElectricBikeIcon,
  swim: PoolIcon,
  stairs: StairsIcon,
  rowing: RowingIcon,
  ski: DownhillSkiingIcon,
  snowboard: SnowboardingIcon,
  hiking: HikingIcon,
  walk: DirectionsWalkIcon,
  nordic: NordicWalkingIcon,
  surf: SurfingIcon,
  skate: SkateboardingIcon,
  sailing: SailingIcon,
  yoga: SelfImprovementIcon,
  stretch: SportsGymnasticsIcon,
  martial: SportsMartialArtsIcon,
  tennis: SportsTennisIcon,
  basketball: SportsBasketballIcon,
  soccer: SportsSoccerIcon,
  gym: FitnessCenterIcon,
  body: AccessibilityIcon,
  spa: SpaIcon,
  waves: WavesIcon,
  bolt: BoltIcon,
  timer: TimerIcon,
} as const;

export type IconKey = keyof typeof ICONS;

export const ICON_KEYS = Object.keys(ICONS) as IconKey[];

export function ActivityIcon({
  icon,
  fontSize = "small",
}: {
  icon: IconKey | null | undefined;
  fontSize?: "small" | "medium" | "large";
}) {
  const Component = (icon && ICONS[icon]) || ICONS.bolt;
  return <Component fontSize={fontSize} />;
}
