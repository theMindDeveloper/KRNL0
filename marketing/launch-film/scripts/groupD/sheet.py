import sys,subprocess,os
from PIL import Image
S='/tmp/claude-0/-home-user-KRNL0/9c42f94d-524b-5d3a-88bf-f40d159a1509/scratchpad/dD'
os.makedirs(S,exist_ok=True)
vid=sys.argv[1]; ts=[float(x) for x in sys.argv[2].split(',')]; out=sys.argv[3]
ims=[]
for t in ts:
    p=f'{S}/_f.png'
    subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',vid,'-frames:v','1','-vf','scale=960:-1',p],check=True)
    ims.append(Image.open(p).convert('RGB').copy())
w,h=ims[0].size; cols=2; rows=(len(ims)+1)//2
sh=Image.new('RGB',(w*cols,h*rows))
for i,im in enumerate(ims): sh.paste(im,((i%cols)*w,(i//cols)*h))
sh.save(f'{S}/{out}')
