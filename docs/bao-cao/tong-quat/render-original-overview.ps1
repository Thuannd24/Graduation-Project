# Render the repaired original Visual Paradigm layout without rebuilding its topology.
param([string]$Folder=$PSScriptRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
[xml]$xml=Get-Content -LiteralPath (Join-Path $Folder 'uc-tong-quan-sua-tren-ban-goc.xml') -Raw -Encoding utf8
$ns=New-Object Xml.XmlNamespaceManager($xml.NameTable);$ns.AddNamespace('v',$xml.DocumentElement.NamespaceURI)
$diagram=$xml.SelectSingleNode('//v:Diagram[@id="HzzVSYWGAqAAaxDW"]',$ns)
$models=@{};foreach($m in $xml.SelectNodes('//v:Model[@id]',$ns)){$models[$m.id]=$m}
$shapes=@($diagram.SelectNodes('.//v:Shape',$ns));$connectors=@($diagram.SelectNodes('./v:Connectors/v:Connector',$ns));$byShape=@{}
foreach($s in $shapes){$byShape[$s.id]=$s}
$minX=[Math]::Floor(($shapes|ForEach-Object{[double]$_.x}|Measure-Object -Minimum).Minimum)-40
$minY=[Math]::Floor(($shapes|ForEach-Object{[double]$_.y}|Measure-Object -Minimum).Minimum)-20
$maxX=($shapes|ForEach-Object{[double]$_.x+[double]$_.width}|Measure-Object -Maximum).Maximum+50
$maxY=($shapes|ForEach-Object{[double]$_.y+[double]$_.height}|Measure-Object -Maximum).Maximum+30
foreach($c in $connectors){foreach($p in $c.SelectNodes('./v:Points/v:Point',$ns)){$minX=[Math]::Min($minX,[double]$p.x-20);$minY=[Math]::Min($minY,[double]$p.y-20);$maxX=[Math]::Max($maxX,[double]$p.x+20);$maxY=[Math]::Max($maxY,[double]$p.y+20)}}
$width=[int][Math]::Ceiling($maxX-$minX);$height=[int][Math]::Ceiling($maxY-$minY)
$measureBitmap=New-Object Drawing.Bitmap(1,1);$measure=[Drawing.Graphics]::FromImage($measureBitmap);$font=New-Object Drawing.Font('Arial',11,[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
function EscapeXml($s){[Security.SecurityElement]::Escape($s)}
function Wrap($s,$maxWidth){$result=New-Object 'System.Collections.Generic.List[string]';foreach($paragraph in ($s -split '\r?\n')){$line='';foreach($word in ($paragraph -split '\s+')){$candidate=($line+' '+$word).Trim();if($line -and $measure.MeasureString($candidate,$font).Width -gt $maxWidth){$result.Add($line);$line=$word}else{$line=$candidate}};$result.Add($line)};return $result.ToArray()}
function Text($x,$y,$text,$size=11,$bold=$false,$center=$true){$anchor=if($center){' text-anchor="middle"'}else{''};$weight=if($bold){' font-weight="bold"'}else{''};[void]$svg.AppendLine('<text x="'+$x+'" y="'+$y+'"'+$anchor+' font-family="Arial" font-size="'+$size+'"'+$weight+'>'+(EscapeXml $text)+'</text>')}
function EndId($model,$property){$n=$model.SelectSingleNode('./v:ModelProperties/*[@name="'+$property+'"]/v:ModelRef',$ns);if($n){return $n.id};return ''}
function ExtensionPoints($modelId){$result=@();foreach($c in $connectors|Where-Object shapeType -eq 'Extend'){$m=$models[$c.model];if((EndId $m 'from') -eq $modelId){$p=$m.SelectSingleNode('./v:ModelProperties/v:ModelProperty[@name="extensionPoint"]/v:Model',$ns);if($p){$result+=,$p.name}}};return $result}
$svg=New-Object Text.StringBuilder
[void]$svg.AppendLine('<svg xmlns="http://www.w3.org/2000/svg" width="'+$width+'" height="'+$height+'" viewBox="'+$minX+' '+$minY+' '+$width+' '+$height+'">')
[void]$svg.AppendLine('<rect x="'+$minX+'" y="'+$minY+'" width="'+$width+'" height="'+$height+'" fill="white"/>')
$system=$shapes|Where-Object shapeType -eq 'System'|Select-Object -First 1
[void]$svg.AppendLine('<g class="cluster"><rect x="'+$system.x+'" y="'+$system.y+'" width="'+$system.width+'" height="'+$system.height+'" fill="#7ACFF5" stroke="black"/>')
Text ([double]$system.x+[double]$system.width/2) ([double]$system.y+15) $system.name 11
[void]$svg.AppendLine('</g>')
foreach($c in $connectors){
 $pts=@($c.SelectNodes('./v:Points/v:Point',$ns));if($pts.Count -lt 2){continue}
 $d='';for($i=0;$i -lt $pts.Count-1;$i++){$d+='M'+$pts[$i].x+','+$pts[$i].y+' L'+$pts[$i+1].x+','+$pts[$i+1].y+' '}
 $dash=if($c.shapeType -in 'Include','Extend'){' stroke-dasharray="5,4"'}else{''}
 [void]$svg.AppendLine('<g class="link"><path d="'+$d+'" fill="none" stroke="black"'+$dash+'/>')
 if($c.shapeType -in 'Include','Extend','Generalization'){
  $reverse=$c.shapeType -in 'Extend','Generalization'
  $target=if($reverse){$pts[0]}else{$pts[$pts.Count-1]};$previous=if($reverse){$pts[1]}else{$pts[$pts.Count-2]}
  $dx=[double]$target.x-[double]$previous.x;$dy=[double]$target.y-[double]$previous.y;$len=[Math]::Sqrt($dx*$dx+$dy*$dy);if($len -lt 1){$len=1;$dx=1};$ux=$dx/$len;$uy=$dy/$len;$ex=[double]$target.x;$ey=[double]$target.y
  $px=$ex-10*$ux+4*$uy;$py=$ey-10*$uy-4*$ux;$qx=$ex-10*$ux-4*$uy;$qy=$ey-10*$uy+4*$ux
  if($c.shapeType -eq 'Generalization'){$targetShape=if($reverse){$byShape[$c.from]}else{$byShape[$c.to]};$fill=if($targetShape.shapeType -eq 'Actor'){'white'}else{'#7ACFF5'};[void]$svg.AppendLine('<polygon points="'+$ex+','+$ey+' '+$px+','+$py+' '+$qx+','+$qy+'" fill="'+$fill+'" stroke="black"/>')}
  else{
   [void]$svg.AppendLine('<path d="M'+$px+','+$py+' L'+$ex+','+$ey+' M'+$ex+','+$ey+' L'+$qx+','+$qy+'" fill="none" stroke="black"/>')
   $longest=-1;$labelA=$pts[0];$labelB=$pts[1];for($i=0;$i -lt $pts.Count-1;$i++){$distance=[Math]::Abs([double]$pts[$i+1].x-[double]$pts[$i].x)+[Math]::Abs([double]$pts[$i+1].y-[double]$pts[$i].y);if($distance -gt $longest){$longest=$distance;$labelA=$pts[$i];$labelB=$pts[$i+1]}}
   $lx=([double]$labelA.x+[double]$labelB.x)/2;$ly=([double]$labelA.y+[double]$labelB.y)/2-5
   Text $lx $ly ('<<'+$c.shapeType.ToLowerInvariant()+'>>') 10
  }
 }
 [void]$svg.AppendLine('</g>')
}
foreach($s in $shapes|Where-Object shapeType -ne 'System'){
 $x=[double]$s.x;$y=[double]$s.y;$w=[double]$s.width;$h=[double]$s.height;$cx=$x+$w/2;$cy=$y+$h/2;$name=$models[$s.model].name
 [void]$svg.AppendLine('<g class="entity" data-model-id="'+$s.model+'">')
 if($s.shapeType -eq 'Actor'){
  [void]$svg.AppendLine('<ellipse cx="'+$cx+'" cy="'+($y+8)+'" rx="7" ry="7" fill="#7ACFF5" stroke="black"/>')
  [void]$svg.AppendLine('<path d="M'+$cx+','+($y+15)+' L'+$cx+','+($y+39)+' M'+($cx-13)+','+($y+25)+' L'+($cx+13)+','+($y+25)+' M'+$cx+','+($y+39)+' L'+($cx-13)+','+($y+56)+' M'+$cx+','+($y+39)+' L'+($cx+13)+','+($y+56)+'" fill="none" stroke="black"/>')
  Text $cx ($y+72) $name 11
 }else{
  $rx=$w/2;$ry=$h/2;[void]$svg.AppendLine('<ellipse cx="'+$cx+'" cy="'+$cy+'" rx="'+$rx+'" ry="'+$ry+'" fill="#7ACFF5" stroke="black"/>')
  $points=@(ExtensionPoints $s.model);$titleLines=@(Wrap $name ($w*0.85))
  if($points.Count -gt 0 -and $h -ge 55){$titleY=$y+16;foreach($line in $titleLines){Text $cx $titleY $line 11;$titleY+=12};$separator=[Math]::Max($titleY+1,$cy-8);$offset=($separator-$cy)/$ry;$chord=$rx*[Math]::Sqrt([Math]::Max(0,1-$offset*$offset));[void]$svg.AppendLine('<path d="M'+($cx-$chord)+','+$separator+' L'+($cx+$chord)+','+$separator+'" fill="none" stroke="black"/>');$ty=$separator+13;Text $cx $ty 'extension points' 10 $true;$ty+=12;foreach($point in $points){foreach($line in @(Wrap $point ($w*0.82))){Text $cx $ty $line 9;$ty+=11}}}
  else{$ty=$cy-($titleLines.Count-1)*6+4;foreach($line in $titleLines){Text $cx $ty $line 11;$ty+=12}}
 }
 [void]$svg.AppendLine('</g>')
}
[void]$svg.AppendLine('</svg>')
$measure.Dispose();$measureBitmap.Dispose();$font.Dispose()
$svgPath=Join-Path $Folder '00-use-case-tong-quan.svg';[IO.File]::WriteAllText($svgPath,$svg.ToString(),(New-Object Text.UTF8Encoding($false)))

$bitmap=New-Object Drawing.Bitmap($width,$height);$graphics=[Drawing.Graphics]::FromImage($bitmap);$graphics.Clear([Drawing.Color]::White);$graphics.TranslateTransform(-$minX,-$minY);$graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias;$graphics.TextRenderingHint=[Drawing.Text.TextRenderingHint]::AntiAliasGridFit
[xml]$imageSvg=$svg.ToString()
foreach($n in $imageSvg.SelectNodes('//*')){
 $pen=$null;$brush=$null;$stroke=$n.GetAttribute('stroke');$fill=$n.GetAttribute('fill')
 if($stroke){$pen=New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml($stroke),1);if($n.GetAttribute('stroke-dasharray')){$pen.DashStyle=[Drawing.Drawing2D.DashStyle]::Dash}}
 if($fill -and $fill -ne 'none'){$brush=New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml($fill))}
 switch($n.LocalName){
  'rect'{$r=New-Object Drawing.RectangleF([single]$n.x,[single]$n.y,[single]$n.width,[single]$n.height);if($brush){$graphics.FillRectangle($brush,$r)};if($pen){$graphics.DrawRectangle($pen,$r.X,$r.Y,$r.Width,$r.Height)}}
  'ellipse'{$r=New-Object Drawing.RectangleF([single]([double]$n.cx-[double]$n.rx),[single]([double]$n.cy-[double]$n.ry),[single](2*[double]$n.rx),[single](2*[double]$n.ry));if($brush){$graphics.FillEllipse($brush,$r)};if($pen){$graphics.DrawEllipse($pen,$r)}}
  'path'{$v=@([regex]::Matches($n.d,'-?\d+(?:\.\d+)?')|ForEach-Object{[single]$_.Value});for($i=0;$i+3 -lt $v.Count;$i+=4){$graphics.DrawLine($pen,$v[$i],$v[$i+1],$v[$i+2],$v[$i+3])}}
  'polygon'{$v=@([regex]::Matches($n.points,'-?\d+(?:\.\d+)?')|ForEach-Object{[single]$_.Value});$pts=@(for($i=0;$i -lt $v.Count;$i+=2){New-Object Drawing.PointF($v[$i],$v[$i+1])});if($brush){$graphics.FillPolygon($brush,[Drawing.PointF[]]$pts)};if($pen){$graphics.DrawPolygon($pen,[Drawing.PointF[]]$pts)}}
  'text'{$style=if($n.GetAttribute('font-weight') -eq 'bold'){[Drawing.FontStyle]::Bold}else{[Drawing.FontStyle]::Regular};$f=New-Object Drawing.Font('Arial',[single]$n.GetAttribute('font-size'),$style,[Drawing.GraphicsUnit]::Pixel);$format=New-Object Drawing.StringFormat;if($n.GetAttribute('text-anchor') -eq 'middle'){$format.Alignment=[Drawing.StringAlignment]::Center};$graphics.DrawString($n.InnerText,$f,[Drawing.Brushes]::Black,[single]$n.x,([single]$n.y-[single]$n.GetAttribute('font-size')),$format);$format.Dispose();$f.Dispose()}
 }
 if($pen){$pen.Dispose()};if($brush){$brush.Dispose()}
}
$bitmap.Save((Join-Path $Folder '00-use-case-tong-quan.png'),[Drawing.Imaging.ImageFormat]::Png)
$bitmap.Save((Join-Path $Folder '00-use-case-tong-quan-doc.png'),[Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose();$bitmap.Dispose()
[IO.File]::WriteAllText((Join-Path $Folder '00-use-case-tong-quan-doc.svg'),$svg.ToString(),(New-Object Text.UTF8Encoding($false)))

# PUML is an editable graph companion; the XML/VPP retains the exact original IDs and coordinates.
$source=New-Object Text.StringBuilder
[void]$source.AppendLine('@startuml')
foreach($setting in @('left to right direction','skinparam defaultFontName Arial','skinparam defaultFontSize 11','skinparam shadowing false','skinparam packageStyle rectangle','skinparam backgroundColor white','skinparam usecaseBackgroundColor #7ACFF5','skinparam usecaseBorderColor black','skinparam rectangleBackgroundColor #7ACFF5','skinparam linetype ortho')){[void]$source.AppendLine($setting)}
[void]$source.AppendLine("' Repaired from uc_tong_quan.vpp; original role names and use cases retained.")
$aliases=@{}
foreach($s in $shapes|Where-Object shapeType -eq 'Actor'){$name=$models[$s.model].name;$alias=$name -replace '[^a-zA-Z0-9_]','_';$aliases[$s.model]=$alias;[void]$source.AppendLine('actor "'+$name+'" as '+$alias)}
[void]$source.AppendLine('rectangle "AuraTech E-Commerce" #7ACFF5 {')
$i=0;foreach($s in $shapes|Where-Object shapeType -eq 'UseCase'|Sort-Object {[int]$_.y}){$i++;$aliases[$s.model]='U'+$i;$name=$models[$s.model].name;$ep=@(ExtensionPoints $s.model);$label=$name;if($ep.Count){$label+='\n--\nextension points\n'+($ep -join '\n')};$label=$label.Replace([Environment]::NewLine,'\n');[void]$source.AppendLine('  usecase "'+$label+'" as U'+$i)}
[void]$source.AppendLine('}')
foreach($c in $connectors){$m=$models[$c.model];$from=$byShape[$c.from].model;$to=$byShape[$c.to].model;$a=$aliases[$from];$b=$aliases[$to];switch($c.shapeType){'Association'{[void]$source.AppendLine($a+' -- '+$b)}'Generalization'{[void]$source.AppendLine($b+' -up-|> '+$a)}'Include'{[void]$source.AppendLine($a+' ..> '+$b+' : <<include>>')}'Extend'{$condition=$m.name;$suffix=if($condition){'\n'+$condition}else{''};[void]$source.AppendLine($b+' ..> '+$a+' : <<extend>>'+$suffix)}}}
[void]$source.AppendLine('@enduml')
[IO.File]::WriteAllText((Join-Path $Folder '00-use-case-tong-quan.puml'),$source.ToString(),(New-Object Text.UTF8Encoding($false)))
Write-Output ('Rendered repaired original: '+$width+' x '+$height+', '+@($shapes|Where-Object shapeType -eq 'UseCase').Count+' UC views')
