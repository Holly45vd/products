// src/components/ProductCard.jsx
import React, { useMemo } from "react";
import {
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
  Box,
  Tooltip,
  IconButton,
} from "@mui/material";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import FavoriteIcon from "@mui/icons-material/Favorite";

export default function ProductCard({
  product,
  user,
  isSaved = false,
  onToggleSave,
  onTagClick,
  restockPending,
  dense = true,
  maxTags = 3,
  showCategories = true,
  showTags = true,
}) {
  const {
    id,
    name,
    price,
    imageUrl,
    tags = [],
    link,
    categoryL1,
    categoryL2,
  } = product || {};

  const _restockPending = useMemo(() => {
    if (typeof restockPending === "boolean") return restockPending;
    const hasRestockKeyword = (v) => {
      if (!v) return false;
      const s = Array.isArray(v) ? v.join(" ") : String(v);
      return /재입고\s*예정|재입고예정/i.test(s);
    };
    return hasRestockKeyword(tags);
  }, [restockPending, tags]);

  const tryToggle = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }
    onToggleSave && onToggleSave(id);
  };

  const fmtKRW = (n) =>
    typeof n === "number" ? n.toLocaleString("ko-KR") + "원" : "-";

  // 고정 사이즈(그리드 4열 맞춤)
  const CARD_W = 250;
  const CARD_H = 400;
  const GAP_Y = 0.5;
  const TITLE_V = "body2";
  const PRICE_V = "body2";
  const CHIP_SIZE = "small";
  const CONTENT_P = 1;
  const SHOW_TAG_ICON = false;

  const limitedTags = showTags ? tags.slice(0, maxTags) : [];
  const restTagCount = Math.max(0, tags.length - limitedTags.length);

  return (
    <Card
      variant="outlined"
      sx={{
        width: CARD_W,
        height: CARD_H,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 이미지(정사각) + 링크 */}
      <CardActionArea
        component="a"
        href={link || "#"}
        target={link ? "_blank" : undefined}
        rel={link ? "noopener noreferrer" : undefined}
        sx={{ position: "relative" }}
      >
        {/* 안전한 정사각 박스 (aspect-ratio 미지원 환경 대응) */}
        <Box sx={{ position: "relative", width: "100%", pt: "100%", bgcolor: "grey.50" }}>
          {imageUrl ? (
            <Box
              component="img"
              alt={name}
              src={imageUrl}
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: _restockPending ? "grayscale(80%)" : "none",
              }}
            />
          ) : (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "grey.100",
                color: "text.secondary",
                fontSize: 11,
              }}
            >
              No Image
            </Box>
          )}

          {/* 재입고 예정 오버레이 */}
          {_restockPending && (
            <Box
              aria-label="재입고 예정"
              title="재입고 예정"
              sx={{
                position: "absolute",
                inset: 0,
                bgcolor: "rgba(55,65,81,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: "#fff", fontWeight: 800, letterSpacing: 0.5 }}
              >
                재입고 예정
              </Typography>
            </Box>
          )}

          {/* 우상단 하트(찜) */}
          <Tooltip title={user ? (isSaved ? "저장 해제" : "저장하기") : "로그인이 필요합니다."}>
            <span>
              <IconButton
                onClick={tryToggle}
                size="small"
                disabled={!user}
                sx={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  bgcolor: "rgba(255,255,255,0.85)",
                  border: "1px solid",
                  borderColor: "grey.300",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.95)" },
                }}
              >
                {isSaved ? (
                  <FavoriteIcon sx={{ color: "grey.900" }} />
                ) : (
                  <FavoriteBorderIcon sx={{ color: "grey.700" }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </CardActionArea>

      {/* 본문 */}
      <CardContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: GAP_Y,
          p: CONTENT_P,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* 제목: 2줄 말줄임 */}
        <Typography
          variant={TITLE_V}
          fontWeight={700}
          sx={{
            color: _restockPending ? "grey.700" : "text.primary",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.25,
            fontSize: 13,
          }}
          title={name}
        >
          {name}
        </Typography>

        {/* 카테고리: 1줄만 노출 */}
        {showCategories && (categoryL1 || categoryL2 || _restockPending) && (
          <Box sx={{ maxHeight: 26, overflow: "hidden" }}>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
              {categoryL1 && (
                <Chip size={CHIP_SIZE} variant="outlined" color="primary" label={`L1: ${categoryL1}`} />
              )}
              {categoryL2 && (
                <Chip size={CHIP_SIZE} variant="outlined" color="info" label={`L2: ${categoryL2}`} />
              )}
              {_restockPending && <Chip size={CHIP_SIZE} variant="outlined" label="재입고 예정" />}
            </Stack>
          </Box>
        )}

        {/* 가격 */}
        <Typography variant={PRICE_V} fontWeight={700} sx={{ fontSize: 13 }}>
          {fmtKRW(price)}
        </Typography>

        {/* 태그: 1줄만 +N */}
        {showTags && limitedTags.length > 0 && (
          <Box sx={{ maxHeight: 24, overflow: "hidden" }}>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
              {limitedTags.map((t) => (
                <Chip
                  key={t}
                  size={CHIP_SIZE}
                  variant="outlined"
                  icon={SHOW_TAG_ICON ? <LocalOfferIcon /> : undefined}
                  label={`#${t}`}
                  clickable={!!onTagClick}
                  onClick={onTagClick ? () => onTagClick(t) : undefined}
                />
              ))}
              {restTagCount > 0 && (
                <Chip
                  size={CHIP_SIZE}
                  variant="outlined"
                  label={`+${restTagCount}`}
                  title={tags.slice(maxTags).join(", ")}
                />
              )}
            </Stack>
          </Box>
        )}

        <Box sx={{ mt: "auto" }} />
      </CardContent>
    </Card>
  );
}
